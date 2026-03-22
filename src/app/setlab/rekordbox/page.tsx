"use client"
import { useState } from "react"
export default function Rekordbox() {
  const [imported, setImported] = useState(false)
  return (
    <div style={{fontFamily:"DM Mono,monospace",color:"#f0ebe2",background:"#1a1410",minHeight:"100vh",padding:"32px"}}>
      <div style={{fontSize:"9px",letterSpacing:"0.3em",color:"#c9a46e",textTransform:"uppercase",marginBottom:"24px"}}>SetLab — Rekordbox Import</div>
      <div style={{maxWidth:"600px"}}>
        <div style={{fontSize:"22px",fontWeight:300,marginBottom:"16px",fontFamily:"Unbounded,sans-serif"}}>Import your library</div>
        <p style={{fontSize:"13px",color:"#8a7a5a",lineHeight:"1.8",marginBottom:"32px"}}>Export your collection from rekordbox: File → Export Collection in xml format. Then upload here — your tracks import with BPM, key, and energy already populated.</p>
        <div style={{border:"1px dashed #3a2e1c",padding:"40px",textAlign:"center",marginBottom:"24px",cursor:"pointer",background:"#0e0b06"}} onClick={()=>setImported(true)}>
          {imported ? <div style={{color:"#c9a46e"}}>Collection imported — tracks available in SetLab Library</div> : <div style={{color:"#5a4428"}}>Drop rekordbox XML file here or click to browse</div>}
        </div>
        <div style={{fontSize:"11px",color:"#3a2e1c",lineHeight:"1.8"}}>
          <div>In rekordbox: File → Export Collection in xml format</div>
          <div>After import: tracks appear in SetLab Library with full metadata</div>
          <div>Export back: set your playlist, export as crate to rekordbox</div>
        </div>
      </div>
    </div>
  )
}