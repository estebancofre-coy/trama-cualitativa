import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { demoProject } from '../src/domain.js';

function harness() {
  const props = new Map([['TRAMA_OWNER','owner@example.test'],['TRAMA_FOLDER','root'],['TRAMA_SHEET','book']]);
  const files = new Map(), folders = new Map();
  let sequence=0, locked=false, failWrite=false;
  const identity={active:'owner@example.test',effective:'owner@example.test'};
  class Sheet {
    constructor(name) {this.name=name;this.rows=[['header']];}
    getLastRow() {return this.rows.length;}
    getMaxRows() {return 1000;}
    insertRowsAfter() {}
    setFrozenRows() {}
    getRange(row,col,count,width) {
      return {
        getValues:()=>Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>this.rows[row-1+i]?.[col-1+j] ?? '')),
        setValues:values=>{
          if(failWrite) {failWrite=false;throw new Error('simulated Sheets failure');}
          values.forEach((value,i)=>{
            this.rows[row-1+i] ||= [];
            value.forEach((cell,j)=>{this.rows[row-1+i][col-1+j]=cell;});
          });
        },
        clearContent:()=>{for(let i=row-1;i<row-1+count;i++)for(let j=col-1;j<col-1+width;j++)if(this.rows[i])this.rows[i][j]='';},
      };
    }
  }
  const sheets=new Map(['Proyectos','Documentos','Preguntas','Categorias','Codigos','Citas','Relaciones','Bitacora'].map(name=>[name,new Sheet(name)]));
  const iterator=items=>{let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};};
  function folder(id) {
    const obj={
      id,children:[],
      getId:()=>id,getUrl:()=>`https://drive.google.com/drive/folders/${id}`,
      createFolder:name=>{const f=folder(`folder-${++sequence}`);f.name=name;obj.children.push(f);return f;},
      getFoldersByName:name=>iterator(obj.children.filter(f=>f.name===name)),
      getFiles:()=>iterator([...files.values()].filter(f=>f.folderId===id)),
      createFile:blob=>{
        const fileId=`file-${++sequence}`;
        const f={getId:()=>fileId,getName:()=>blob.name,getBlob:()=>({getDataAsString:()=>Buffer.isBuffer(blob.content)?blob.content.toString('utf8'):blob.content}),getDateCreated:()=>new Date(),folderId:id};
        files.set(fileId,f);return f;
      },
    };
    folders.set(id,obj);return obj;
  }
  folder('root');
  const book={getSheetByName:name=>sheets.get(name),getUrl:()=> 'https://docs.google.com/spreadsheets/d/book'};
  const context=vm.createContext({
    console, Date, JSON, Set, Map,
    Session:{getActiveUser:()=>({getEmail:()=>identity.active}),getEffectiveUser:()=>({getEmail:()=>identity.effective})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key) || null,setProperty:(key,value)=>props.set(key,value)})},
    SpreadsheetApp:{openById:()=>book,flush:()=>{}},
    DriveApp:{getFolderById:id=>{if(!folders.has(id))throw new Error('folder missing');return folders.get(id);},getFileById:id=>{if(!files.has(id))throw new Error('file missing');return files.get(id);}},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
    Utilities:{newBlob:(content,mime,name)=>({content,mime,name,getBytes:()=>Buffer.from(content)}),base64Decode:text=>Buffer.from(text,'base64'),getUuid:()=>`uuid-${++sequence}`},
    ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/test/exec'})},
    HtmlService:{createHtmlOutputFromFile:()=>({getContent:()=>'<html><head></head><body></body></html>'}),createHtmlOutput:html=>({setTitle:title=>({title,html})})},
  });
  const domain=readFileSync(new URL('../src/domain.js',import.meta.url),'utf8').replace(/^export /gm,'').replace('const uid = () => crypto.randomUUID();','const uid = () => Utilities.getUuid();');
  vm.runInContext(domain+'\n'+readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
  return {context,identity,props,files,folders,sheets,failNextWrite:()=>{failWrite=true;},setLocked:()=>{locked=true;}};
}

test('all cloud entry points fail closed for absent or different active identity',()=>{
  const h=harness();
  for(const active of ['', 'intruder@example.test']) {
    h.identity.active=active;
    for(const invoke of [
      ()=>h.context.doGet(),
      ()=>h.context.listCloudProjects(),
      ()=>h.context.getCloudInfo(),
      ()=>h.context.saveCloudProject(demoProject(),null,'request-1'),
      ()=>h.context.uploadCloudOriginal('YQ==','a.txt','text/plain'),
      ()=>h.context.rebuildCloudIndexes(),
      ()=>h.context.listCloudVersions('p'),
      ()=>h.context.getCloudVersion('p','f'),
    ]) assert.throws(invoke,/Acceso denegado/);
  }
  h.identity.active='owner@example.test';h.identity.effective='intruder@example.test';
  assert.throws(()=>h.context.listCloudProjects(),/Acceso denegado/);
});
test('setup reuses private resource identifiers and refreshes index headers',()=>{
  const h=harness();
  const result=h.context.setupTrama();
  assert.equal(result.spreadsheetUrl,'https://docs.google.com/spreadsheets/d/book');
  assert.equal(h.props.get('TRAMA_FOLDER'),'root');
  assert.equal(h.sheets.get('Preguntas').rows[0][2],'Tipo');
  assert.equal(h.sheets.get('Citas').rows[0][8],'Preguntas y objetivos');
  assert.equal(h.files.size,0);
  h.identity.active='intruder@example.test';
  assert.throws(()=>h.context.setupTrama(),/cuenta propietaria/);
});
test('private popup links preserve deployment URL and validated map context',()=>{
  const h=harness();
  const main=h.context.doGet();
  assert.match(main.html,/"appUrl":"https:\/\/script.google.com\/macros\/s\/test\/exec"/);
  const popup=h.context.doGet({parameter:{mapWindow:'map-1',project:'project-1'}});
  assert.match(popup.html,/"mapId":"map-1","projectId":"project-1"/);
  assert.throws(()=>h.context.doGet({parameter:{mapWindow:'</script>',project:'project-1'}}),/no es válido/);
  assert.throws(()=>h.context.doGet({parameter:{mapWindow:'map-1'}}),/no es válido/);
});
test('creates immutable cloud versions and detects optimistic concurrency conflicts',()=>{
  const h=harness(),p=demoProject();
  const first=h.context.saveCloudProject(p,null,'request-1');
  assert.equal(first.revision,'request-1');
  assert.equal(h.files.size,1);
  const next=JSON.parse(JSON.stringify(first.project));next.name='Actualizado';
  const second=h.context.saveCloudProject(next,first.project.updatedAt,'request-2');
  assert.notEqual(first.project.updatedAt,second.project.updatedAt);
  assert.equal(h.files.size,2);
  assert.equal(h.context.listCloudProjects()[0].name,'Actualizado');
  assert.throws(()=>h.context.saveCloudProject(p,first.project.updatedAt,'request-stale'),/CONFLICTO/);
  assert.equal(h.files.size,2);
});
test('same request retries are idempotent and do not duplicate snapshots',()=>{
  const h=harness(),p=demoProject();
  h.context.saveCloudProject(p,null,'request-1');
  const retry=h.context.saveCloudProject(p,null,'request-1');
  assert.equal(h.files.size,1);
  assert.equal(retry.project.id,p.id);
  assert.throws(()=>h.context.saveCloudProject(p,null,'new-request'),/CONFLICTO/);
});
test('failed pointer write preserves previous project and keeps incomplete version uncommitted',()=>{
  const h=harness(),p=demoProject();
  const first=h.context.saveCloudProject(p,null,'request-1');
  const next=JSON.parse(JSON.stringify(first.project));next.name='Must not commit';
  h.failNextWrite();
  assert.throws(()=>h.context.saveCloudProject(next,first.project.updatedAt,'request-2'),/Sheets failure/);
  assert.equal(h.context.listCloudProjects()[0].name,p.name);
  assert.equal(h.files.size,2);
  const retry=h.context.saveCloudProject(next,first.project.updatedAt,'request-2');
  assert.equal(retry.project.name,'Must not commit');
});
test('indices are regenerable projections and never contain full transcript or formula cells',()=>{
  const h=harness(),p=demoProject();
  p.codes[0].name='=IMPORTXML("bad")';
  h.context.saveCloudProject(p,null,'request-1');
  const indexed=h.context.rebuildCloudIndexes();
  assert.equal(indexed.projects,1);
  assert.equal(h.sheets.get('Codigos').rows[1][2],`'=IMPORTXML("bad")`);
  assert.equal(h.sheets.get('Documentos').rows[1][3],String(p.documents[0].text.length));
  assert.equal(h.sheets.get('Citas').rows[1].length,9);
  assert.ok(!JSON.stringify(h.sheets.get('Documentos').rows).includes('ENTREVISTADORA:'));
  assert.equal(h.sheets.get('Proyectos').rows[1][6],h.context.listCloudProjects()[0].updatedAt);
});
test('failed projection rebuild leaves canonical project readable and marks indices stale',()=>{
  const h=harness(),p=demoProject();
  h.context.saveCloudProject(p,null,'request-1');
  h.context.rebuildCloudIndexes();
  h.failNextWrite();
  assert.throws(()=>h.context.rebuildCloudIndexes(),/Sheets failure/);
  assert.equal(h.sheets.get('Proyectos').rows[1][6],'');
  assert.equal(h.context.listCloudProjects()[0].id,p.id);
});
test('version downloads verify project membership',()=>{
  const h=harness(),a=demoProject(),b=demoProject();
  h.context.saveCloudProject(a,null,'request-a');
  h.context.saveCloudProject(b,null,'request-b');
  const av=h.context.listCloudVersions(a.id),bv=h.context.listCloudVersions(b.id);
  assert.equal(av.length,1);
  assert.equal(h.context.getCloudVersion(a.id,av[0].id).id,a.id);
  assert.throws(()=>h.context.getCloudVersion(a.id,bv[0].id),/no pertenece/);
});
test('server validates payload, limits, and lock before writing',()=>{
  const h=harness(),p=demoProject();
  const invalid=JSON.parse(JSON.stringify(p));invalid.quotes[0].text='inventada';
  assert.throws(()=>h.context.saveCloudProject(invalid,null,'request-1'),/inválido/);
  assert.throws(()=>h.context.saveCloudProject(p,null,'bad id'),/inválido/);
  assert.equal(h.files.size,0);
  h.setLocked();
  assert.throws(()=>h.context.saveCloudProject(p,null,'request-1'),/Otro guardado/);
});
test('original uploads accept only bounded TXT or DOCX',()=>{
  const h=harness();
  const id=h.context.uploadCloudOriginal(Buffer.from('texto original').toString('base64'),'entrevista.txt','text/plain');
  assert.ok(h.files.has(id));
  assert.equal(h.files.get(id).getBlob().getDataAsString(),'texto original');
  assert.throws(()=>h.context.uploadCloudOriginal('YQ==','run.exe','application/octet-stream'),/Solo se admiten/);
  assert.throws(()=>h.context.uploadCloudOriginal('YQ==','a.txt','text/html'),/no corresponde/);
});
