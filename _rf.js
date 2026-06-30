const {runAgentLoop}=require("./agent"); const path=require("path"),fs=require("fs");
const ws=path.join(__dirname,".rfinal"); fs.rmSync(ws,{recursive:true,force:true}); fs.mkdirSync(ws,{recursive:true});
const sock={emit:(e,p)=>{
  if(e==="agent-phase")console.log("  FASE:",p.label);
  if(e==="agent-action")console.log("  ACAO:",p.tool,JSON.stringify(p.args||{}).slice(0,55));
  if(e==="agent-action-result")console.log("    ->",(p.blocked?"[BLOCK] ":"")+String(p.result).replace(/\n/g," ").slice(0,70));
}};
(async()=>{
  console.log("Pedido: criar soma.js + test.js e rodar");
  const r=await runAgentLoop("http://127.0.0.1:11434","qwen2.5:3b",
    [{role:"user",content:"Crie um arquivo soma.js com: module.exports = (a,b) => a+b;  Depois crie test.js com: const soma=require('./soma'); console.log(soma(2,3)===5?'TESTE OK':'TESTE FALHOU');  Depois rode 'node test.js'."}],
    ws,sock,null,4096,false);
  console.log("\n===== FINAL =====");
  console.log("Texto:",(r.content||"").replace(/\n/g," ").slice(0,200));
  console.log("Arquivos criados:", fs.readdirSync(ws).join(", ") || "(nenhum)");
  for(const f of fs.readdirSync(ws)){ console.log("  --",f,":",fs.readFileSync(path.join(ws,f),"utf8").slice(0,80).replace(/\n/g," ")); }
  process.exit(0);
})().catch(e=>{console.log("EXCECAO:",e.message);process.exit(1)});
