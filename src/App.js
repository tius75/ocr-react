import React, {useState,useEffect,useCallback} from "react";
import {useDropzone} from "react-dropzone";
import Tesseract from "tesseract.js";
import * as XLSX from "xlsx";
import "./App.css";

function App(){

const [masterImage,setMasterImage]=useState(null);
const [compareDocs,setCompareDocs]=useState([]);
const [results,setResults]=useState([]);
const [masterExcel,setMasterExcel]=useState([]);
const [loading,setLoading]=useState(false);
const [textOutput,setTextOutput]=useState("");



/* ==============================
LOAD MASTER FROM LOCAL STORAGE
============================== */

useEffect(()=>{

const saved=localStorage.getItem("MASTER_DOC");

if(saved){

setMasterImage(JSON.parse(saved));

}

},[]);



/* ==============================
NORMALIZE TEXT
============================== */

const normalize=(text)=>{

return String(text)
.toLowerCase()
.replace(/[^a-z0-9]/g,"");

};



/* ==============================
IMAGE HASH
============================== */

const getImageHash=(src)=>{

return new Promise(resolve=>{

const img=new Image();
img.src=src;

img.onload=()=>{

const canvas=document.createElement("canvas");
const ctx=canvas.getContext("2d");

canvas.width=8;
canvas.height=8;

ctx.drawImage(img,0,0,8,8);

const data=ctx.getImageData(0,0,8,8).data;

let hash="";

for(let i=0;i<data.length;i+=4){

hash+=data[i]>128?"1":"0";

}

resolve(hash);

};

});

};



/* ==============================
IMAGE PREPROCESS
============================== */

const preprocessImage=(src)=>{

return new Promise(resolve=>{

const img=new Image();
img.src=src;

img.onload=()=>{

const canvas=document.createElement("canvas");
const ctx=canvas.getContext("2d");

canvas.width=img.width*2;
canvas.height=img.height*2;

ctx.drawImage(img,0,0,canvas.width,canvas.height);

const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
const data=imageData.data;

for(let i=0;i<data.length;i+=4){

const gray=(data[i]+data[i+1]+data[i+2])/3;
const val=gray>170?255:0;

data[i]=val;
data[i+1]=val;
data[i+2]=val;

}

ctx.putImageData(imageData,0,0);

resolve(canvas.toDataURL());

};

});

};



/* ==============================
DETECT DOCUMENT TYPE
============================== */

const detectDocType=(text)=>{

text=text.toLowerCase();

if(text.includes("nik") || text.includes("kartu tanda penduduk"))
return "KTP";

if(text.includes("invoice"))
return "INVOICE";

if(text.includes("purchase order"))
return "PURCHASE ORDER";

if(text.includes("kwitansi") || text.includes("receipt"))
return "RECEIPT";

return "DOKUMEN";

};



/* ==============================
EXTRACT DATA
============================== */

const extractData=(text)=>{

const idRegex=/(inv[\s\-]?\d+|po[\s\-]?\d+|[A-Z0-9]{5,})/i;
const amountRegex=/([\d]{1,3}(?:[.,]\d{3})+)/;
const nikRegex=/\b\d{16}\b/;

const idMatch=text.match(idRegex);
const amountMatch=text.match(amountRegex);
const nikMatch=text.match(nikRegex);

return{

id:idMatch?idMatch[0]:"TIDAK TERDETEKSI",
amount:amountMatch?amountMatch[0].replace(/[^0-9]/g,""):"0",
nik:nikMatch?nikMatch[0]:"",
type:detectDocType(text)

};

};



/* ==============================
UPLOAD MASTER
============================== */

const onDropMaster=useCallback(async(files)=>{

const file=files[0];

const reader=new FileReader();

reader.onload=async(e)=>{

const base64=e.target.result;

setLoading(true);

const processed=await preprocessImage(base64);

const {data:{text,confidence}}=
await Tesseract.recognize(processed,"eng");

const parsed=extractData(text);

const hash=await getImageHash(base64);

const master={
image:base64,
data:parsed,
hash:hash,
confidence:confidence
};

setMasterImage(master);

localStorage.setItem("MASTER_DOC",JSON.stringify(master));

setLoading(false);

};

reader.readAsDataURL(file);

},[]);



/* ==============================
UPLOAD SCAN FILES
============================== */

const onDropCompare=useCallback((files)=>{

setCompareDocs(files.map(file=>Object.assign(file,{
preview:URL.createObjectURL(file)
})));

},[]);



const {getRootProps:masterRoot,getInputProps:masterInput}
=useDropzone({onDrop:onDropMaster,maxFiles:1});

const {getRootProps:compareRoot,getInputProps:compareInput}
=useDropzone({onDrop:onDropCompare});



/* ==============================
UPLOAD EXCEL
============================== */

const handleExcelUpload=(e)=>{

const file=e.target.files[0];
const reader=new FileReader();

reader.onload=evt=>{

const wb=XLSX.read(evt.target.result,{type:"binary"});

const data=XLSX.utils.sheet_to_json(
wb.Sheets[wb.SheetNames[0]]
);

setMasterExcel(data);

};

reader.readAsBinaryString(file);

};



/* ==============================
RUN OCR
============================== */

const runValidation=async()=>{

setLoading(true);

let final=[];
let report="HASIL AUDIT DOKUMEN\n\n";

for(let doc of compareDocs){

const processed=await preprocessImage(doc.preview);

const {data:{text,confidence}}=
await Tesseract.recognize(processed,"eng");

const detected=extractData(text);

const hash=await getImageHash(doc.preview);

const imageStatus=
masterImage && hash===masterImage.hash
?"GAMBAR SAMA":"GAMBAR BERBEDA";

const idMatch=
masterImage &&
normalize(detected.id)===normalize(masterImage.data.id);

const amountMatch=
masterImage &&
parseInt(detected.amount)===parseInt(masterImage.data.amount);

const status=idMatch && amountMatch
?"MATCH":"MISMATCH";

final.push({

fileName:doc.name,
preview:doc.preview,
confidence:confidence,
detected:detected,
imageStatus:imageStatus,
status:status

});

report+=
`FILE : ${doc.name}
JENIS : ${detected.type}
ID : ${detected.id}
NOMINAL : Rp ${detected.amount}
NIK : ${detected.nik}
CONFIDENCE : ${confidence.toFixed(2)}%
STATUS GAMBAR : ${imageStatus}
STATUS DATA : ${status}

---------------------------
`;

}

setResults(final);
setTextOutput(report);
setLoading(false);

};



/* ==============================
SHARE
============================== */

const shareWhatsApp=()=>{

window.open(
"https://wa.me/?text="+encodeURIComponent(textOutput),
"_blank"
);

};



const sendEmail=()=>{

window.location.href=
`mailto:?subject=Hasil Audit Dokumen&body=${encodeURIComponent(textOutput)}`;

};



/* ==============================
UI
============================== */

return(

<div className="container">

<h1>SISTEM AUDIT DOKUMEN OCR</h1>



<div className="card">

<h3>Upload Excel</h3>

<input type="file"
accept=".xlsx,.xls"
onChange={handleExcelUpload}/>

</div>



<div className="card">

<h3>Master Dokumen</h3>

<div {...masterRoot()} className="dropzone">

<input {...masterInput()} />

{masterImage?

<div>

<img src={masterImage.image}
className="img-preview" alt=""/>

<p>ID MASTER : {masterImage.data.id}</p>
<p>JENIS : {masterImage.data.type}</p>

</div>

:

<p>Upload gambar master</p>

}

</div>

</div>



<div className="card">

<h3>Scan Dokumen</h3>

<div {...compareRoot()} className="dropzone">

<input {...compareInput()} />

Tarik banyak file ke sini

</div>



<div className="thumb-row">

{compareDocs.map((f,i)=>

<img key={i}
src={f.preview}
className="thumb"
alt=""/>

)}

</div>

</div>



<button
className="btn"
onClick={runValidation}
disabled={loading}
>

{loading?"Memproses OCR...":"BANDINGKAN"}

</button>



{results.length>0 &&(

<div className="results">

<table>

<thead>

<tr>
<th>Preview</th>
<th>File</th>
<th>Jenis</th>
<th>ID</th>
<th>Nominal</th>
<th>Status Gambar</th>
<th>Status Data</th>
<th>Confidence</th>
</tr>

</thead>

<tbody>

{results.map((r,i)=>(

<tr key={i}>

<td>
<img src={r.preview}
className="img-table"
alt=""/>
</td>

<td>{r.fileName}</td>
<td>{r.detected.type}</td>
<td>{r.detected.id}</td>
<td>Rp {r.detected.amount}</td>
<td>{r.imageStatus}</td>
<td>{r.status}</td>
<td>{r.confidence.toFixed(2)}%</td>

</tr>

))}

</tbody>

</table>



<div style={{marginTop:20}}>

<button onClick={shareWhatsApp}>
Share WhatsApp
</button>

<button onClick={sendEmail}>
Email
</button>

</div>



</div>

)}



{/* ==============================
OUTPUT TEXT LENGKAP
============================== */}

{results.length>0 &&(

<div className="card">

<h3>Laporan Lengkap</h3>

<textarea
value={textOutput}
readOnly
style={{
width:"100%",
height:"300px",
fontSize:"14px"
}}
/>

</div>

)}



</div>

);

}

export default App;