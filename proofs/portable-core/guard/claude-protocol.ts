import { assert, exact, object, text, positive, integer, type Usage } from './contracts.js';
export function claudeRequest(value:unknown,maximum:number):Record<string,unknown> {
 const v=object(value);exact(v,['model','messages','system','max_tokens','stream','tools','tool_choice','temperature','stop_sequences']);text(v.model);
 assert(v.stream===undefined||typeof v.stream==='boolean','invalid stream');
 if(v.max_tokens!==undefined)positive(v.max_tokens);
 if(v.temperature!==undefined)assert(typeof v.temperature==='number'&&v.temperature>=0&&v.temperature<=1,'invalid temperature');
 if(v.system!==undefined)text(v.system);
 assert(Array.isArray(v.messages)&&v.messages.length>0,'messages required');
 for(const raw of v.messages){const m=object(raw);exact(m,['role','content']);assert(m.role==='user'||m.role==='assistant','invalid role');
  if(typeof m.content==='string')continue;
  assert(Array.isArray(m.content),'invalid content');
  for(const raw of m.content){const c=object(raw);
   if(c.type==='text'){exact(c,['type','text']);text(c.text);}
   else if(c.type==='tool_use'){exact(c,['type','id','name','input']);text(c.id);text(c.name);object(c.input);}
   else if(c.type==='tool_result'){exact(c,['type','tool_use_id','content','is_error']);text(c.tool_use_id);text(c.content);assert(c.is_error===undefined||typeof c.is_error==='boolean','invalid tool result');}
   else throw new Error('unsupported content/charge type');
  }
 }
 if(v.tools!==undefined){assert(Array.isArray(v.tools),'invalid tools');for(const raw of v.tools){const t=object(raw);exact(t,['name','description','input_schema']);text(t.name);if(t.description!==undefined)text(t.description);object(t.input_schema);}}
 if(v.tool_choice!==undefined){const t=object(v.tool_choice);exact(t,['type','name','disable_parallel_tool_use']);assert(['auto','any','tool','none'].includes(String(t.type)),'unsupported tool');if(t.name!==undefined)text(t.name);if(t.disable_parallel_tool_use!==undefined)assert(typeof t.disable_parallel_tool_use==='boolean','invalid parallel tools');}
 if(v.stop_sequences!==undefined)assert(Array.isArray(v.stop_sequences)&&v.stop_sequences.every(x=>typeof x==='string'),'invalid stop sequences');
 return {...v,max_tokens:Math.min(v.max_tokens===undefined?maximum:positive(v.max_tokens),maximum)};
}
export function claudeUsage(value:unknown):Usage {const u=object(value);
 // Cache billing is deliberately unsupported by this synthetic tariff, even if zero fields exist.
 exact(u,['input_tokens','output_tokens']);return {inputTokens:integer(u.input_tokens),outputTokens:integer(u.output_tokens)};
}
export function claudeFinal(value:unknown):Usage {const v=object(value);assert(v.type==='message'&&typeof v.id==='string','invalid message completion');assert(['end_turn','tool_use','max_tokens','stop_sequence'].includes(String(v.stop_reason)),'ambiguous completion');return claudeUsage(v.usage);}
