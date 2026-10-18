/** Closed shape vocabulary: no payload values or arbitrary keys survive this boundary. */
const fields = ['model','messages','input','system','tools','tool_choice','thinking','output_config',
  'reasoning','effort','max_tokens','max_output_tokens','stream','metadata','cache_control','type',
  'role','content','text','name','description','parameters','input_schema','store','instructions',
  'include','parallel_tool_calls','temperature','context_management'] as const;
type Field = typeof fields[number];
export type Shape = { type: 'null'|'string'|'number'|'boolean'|'array'|'object'; length?: number;
  fields?: { key: Field; shape: Shape }[]; items?: Shape[]; unknownKeys?: number };
export function summarize(value: unknown): Shape {
  // Validate whole-input resource bounds; this pass emits no keys or values.
  const pending:{value:unknown;depth:number}[]=[{value,depth:0}];let total=0;
  while(pending.length){const entry=pending.pop();if(!entry)break;
    if(++total>1024||entry.depth>12)throw new Error('shape limit');
    if(entry.value!==null&&typeof entry.value==='object'){
      for(const child of Object.values(entry.value))pending.push({value:child,depth:entry.depth+1});
    }
  }
  let visited = 0;
  function walk(v: unknown, depth: number): Shape {
    if (++visited > 1024 || depth > 12) throw new Error('shape limit');
    if (v === null) return {type:'null'};
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return {type:typeof v==='string'?'string':typeof v==='number'?'number':'boolean'};
    if (Array.isArray(v)) return {type:'array',length:v.length,items:v.map(x=>walk(x,depth+1))};
    if (typeof v !== 'object') throw new Error('invalid JSON value');
    const known: {key:Field;shape:Shape}[] = []; let unknownKeys = 0;
    for (const [key,item] of Object.entries(v)) {
      const field = fields.find(f=>f===key);
      // Unknown keys/subtrees are opaque to the output walker; never reflect their contents.
      if (field === undefined) { if (++visited > 1024) throw new Error('shape limit'); unknownKeys++; }
      else known.push({key:field,shape:walk(item,depth+1)});
    }
    return {type:'object',fields:known,unknownKeys};
  }
  return walk(value,0);
}
