const {runAgentLoop}=require("./agent"); const path=require("path"),fs=require("fs");
const ws=path.join(__dirname,".real-test"); fs.rmSync(ws,{recursive:true,force:true}); fs.mkdirSync(ws,{recursive:true});
const ev=[];
const sock={emit:(e,p)=>{ ev.push({e,p}); if(e==="agent-phase") console.log("  FASE:",p.emoji,p.label); if(e==="agent-action") console.log("  ⚙️ acao:",p.tool,JSON.stringify(p.args).slice(0,60)); }};
(async()=>{
  console.log("=== Pedindo ao agente (Ollama real qwen2.5:3b, SEM planning) ===");
  const r=await runAgentLoop("http://127.0.0.1:11434","qwen2.5:3b",
    [{role:"user",content:"Crie um arquivo soma.js com uma funcao que soma dois numeros e um arquivo test.js que testa ela com console.assert. Depois rode node test.js."}],
    ws,sock,null,4096,false);
  console.log("\n=== RESULTADO ===");
  console.log("Resposta final:", (r.content||"").slice(0,200));
  console.log("soma.js criado:", fs.existsSync(path.join(ws,"soma.js")));
  console.log("Arquivos no workspace:", fs.readdirSync(ws).join(", "));
  process.exit(0);
})();
