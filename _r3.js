const {runAgentLoop}=require("./agent"); const path=require("path"),fs=require("fs");
const ws=path.join(__dirname,".r3"); fs.rmSync(ws,{recursive:true,force:true}); fs.mkdirSync(ws,{recursive:true});
let acts=[];
const sock={emit:(e,p)=>{ if(e==="agent-phase")console.log("FASE:",p.label); if(e==="agent-action"){acts.push(p.tool+":"+JSON.stringify(p.args||{}).slice(0,50));console.log("ACAO:",p.tool,JSON.stringify(p.args||{}).slice(0,55))} if(e==="agent-action-result"&&p.blocked)console.log("  🔁BLOCK"); }};
(async()=>{
  const r=await runAgentLoop("http://127.0.0.1:11434","qwen2.5:3b",
    [{role:"user",content:"Crie soma.js com: module.exports=(a,b)=>a+b. Crie test.js: const s=require('./soma'); if(s(2,3)!==5)throw new Error('fail'); console.log('OK'). Rode node test.js."}],
    ws,sock,null,4096,false);
  console.log("\nFINAL:",(r.content||"").slice(0,200));
  console.log("Arquivos:", fs.readdirSync(ws).join(", "));
  process.exit(0);
})();
