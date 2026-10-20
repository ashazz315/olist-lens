// Author header-only input templates through the bundled artifact runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook } from '@oai/artifact-tool';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out=path.join(root,'output','templates');
const schema=JSON.parse(await fs.readFile(path.join(out,'schema.json'),'utf8'));
const workbook=Workbook.create();
for(const [name,table] of Object.entries(schema.tables)){
 const sheet=workbook.worksheets.add(name);
 sheet.getRangeByIndexes(0,0,1,table.fields.length).values=[table.fields.map(f=>f.name)];
}
workbook.recalculate();
for(const [name,table] of Object.entries(schema.tables)){
 const values=workbook.worksheets.getItem(name).getRangeByIndexes(0,0,1,table.fields.length).values;
 const inspection=await workbook.inspect({kind:'table',range:`${name}!A1:${String.fromCharCode(64+table.fields.length)}1`,include:'values',tableMaxRows:1,tableMaxCols:10,maxChars:1600});
 if(!inspection.ndjson)throw Error('Cannot inspect '+name);
 const csv=values.map(row=>row.map(v=>/[",\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v).join(',')).join('\r\n')+'\r\n';
 await fs.writeFile(path.join(out,table.filename),csv,'utf8');
 console.log(`${table.filename}: ${table.fields.length} columns, no data rows`);
}
