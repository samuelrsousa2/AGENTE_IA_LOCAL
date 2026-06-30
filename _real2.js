const {runAgentLoop}=require("./agent"); const path=require("path"),fs=require("fs");
const ws=path.join(__dirname,".real2"); fs.rmSync(ws,{recursive:true,force:true}); fs.mkdirSync(ws,{recursive:true});
const ev=[];
const sock={emit:(e,p)=>{ ev.push({e,p}); if(e==="agent-phase")console.log("FASE:",p.label); if(e==="agent-action")console.log("ACAO:",p.tool,JSON.stringify(p.args||{}).slice(0,70)); if(e==="agent-error")console.log("ERRO:",p.error); }};
(async()=>{
  try{
    const r=await runAgentLoop("http://127.0.0.1:11434","qwen2.5:3b",
      [{role:"user",content:"Crie um arquivo soma.js exportando uma funcao soma(a,b). Crie test.js que faz require e testa. Rode node test.js."}],
      ws,sock,null,4096,false);
    console.log("\nFINAL:",(r.content||"").slice(0,300));
    console.log("Arquivos:", fs.readdirSync(ws).join(", "));
    if(fs.existsSync(path.join(ws,"soma.js"))) console.log("soma.js:\n", fs.readFileSync(path.join(ws,"soma.js"),"utf8").slice(0,200));
  }catch(e){ console.log("EXCECAO:", e.message); }
  process.exit(0);
})();
