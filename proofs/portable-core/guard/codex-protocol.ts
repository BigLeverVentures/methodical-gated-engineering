import { assert, exact, object, text, positive, integer, type Usage } from './contracts.js';
export function codexRequest(value:unknown,maximum:number):Record<string,unknown> {
 const v=object(value);exact(v,['model','input','instructions','max_output_tokens','stream','tools','tool_choice','parallel_tool_calls','reasoning','text','store','service_tier']);text(v.model);
 if(v.instructions!==undefined)text(v.instructions);
 for(const key of ['stream','parallel_tool_calls','store'])if(v[key]!==undefined)assert(typeof v[key]==='boolean','invalid '+key);
 assert(v.store===undefined||v.store===false,'stored state unsupported');assert(v.service_tier===undefined||v.service_tier==='default','premium tier denied');
 if(typeof v.input!=='string'){
  assert(Array.isArray(v.input)&&v.input.length>0,'input required');
  for(const raw of v.input){const m=object(raw);
   if(m.type==='function_call'){exact(m,['type','id','call_id','name','arguments']);if(m.id!==undefined)text(m.id);text(m.call_id);text(m.name);text(m.arguments);}
   else if(m.type==='function_call_output'){exact(m,['type','call_id','output']);text(m.call_id);text(m.output);}
   else {exact(m,['type','role','content']);assert(m.type===undefined||m.type==='message','unsupported input');assert(['user','assistant','system','developer'].includes(String(m.role)),'invalid role');
    if(typeof m.content==='string')continue;assert(Array.isArray(m.content),'invalid content');for(const raw of m.content){const c=object(raw);exact(c,['type','text']);assert(c.type==='input_text'||c.type==='output_text','non-text denied');text(c.text);}
   }
  }
 }
 if(v.reasoning!==undefined){const r=object(v.reasoning);exact(r,['effort','summary']);assert(['low','medium','high','xhigh','max'].includes(String(r.effort)),'invalid effort');if(r.summary!==undefined)assert(['auto','concise','detailed'].includes(String(r.summary)),'invalid summary');}
 if(v.text!==undefined){const t=object(v.text);exact(t,['format','verbosity']);if(t.verbosity!==undefined)assert(['low','medium','high'].includes(String(t.verbosity)),'invalid verbosity');if(t.format!==undefined){const f=object(t.format);exact(f,['type','name','schema','strict']);assert(f.type==='text'||f.type==='json_schema','unsupported format');if(f.type==='json_schema'){text(f.name);object(f.schema);assert(f.strict===true,'strict schema required');}}}
 if(v.tools!==undefined){assert(Array.isArray(v.tools),'invalid tools');for(const raw of v.tools){const t=object(raw);exact(t,['type','name','description','parameters','strict']);assert(t.type==='function','server-side tools denied');text(t.name);object(t.parameters);if(t.description!==undefined)text(t.description);if(t.strict!==undefined)assert(typeof t.strict==='boolean','invalid strict');}}
 if(v.tool_choice!==undefined){if(typeof v.tool_choice==='string')assert(['auto','none','required'].includes(v.tool_choice),'invalid tool choice');else {const t=object(v.tool_choice);exact(t,['type','name']);assert(t.type==='function','invalid tool choice');text(t.name);}}
 return {...v,store:false,service_tier:'default',max_output_tokens:Math.min(v.max_output_tokens===undefined?maximum:positive(v.max_output_tokens),maximum)};
}
export function codexFinal(value:unknown):Usage {const v=object(value);assert(v.object==='response'&&v.status==='completed'&&typeof v.id==='string','ambiguous response completion');const u=object(v.usage);exact(u,['input_tokens','output_tokens','total_tokens','input_tokens_details','output_tokens_details']);
 const inputTokens=integer(u.input_tokens),outputTokens=integer(u.output_tokens);assert(integer(u.total_tokens)===inputTokens+outputTokens,'inconsistent usage');
 if(u.input_tokens_details!==undefined){const d=object(u.input_tokens_details);exact(d,['cached_tokens']);assert(integer(d.cached_tokens)<=inputTokens,'invalid cached usage');}
 if(u.output_tokens_details!==undefined){const d=object(u.output_tokens_details);exact(d,['reasoning_tokens']);assert(integer(d.reasoning_tokens)<=outputTokens,'invalid reasoning usage');}
 return {inputTokens,outputTokens};
}
