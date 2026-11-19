import {readdir,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');
const assets=await Promise.all(['html','css','js'].map((n,i)=>read('src/'+['index.html','style.css','app.js'][i]).then(s=>'const '+n+'='+JSON.stringify(s)+';')));
assets.push('const adminLoginJs='+JSON.stringify(await read('src/admin-login.js'))+';');
assets.push('const adminMailJs='+JSON.stringify(await read('src/admin-mail.js'))+';');
assets.push('const subscriptionJs='+JSON.stringify(await read('src/subscription-ui.js'))+';');
const images = {};
for (const dir of ['portraits','images']) {
  for (const name of await readdir('src/'+dir)) {
    const bytes = await readFile('src/'+dir+'/'+name);
    images['/'+dir+'/'+name] = bytes.toString('base64');
  }
}
assets.push('const images='+JSON.stringify(images)+';');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',[...assets,await read('src/questions.mjs'),await read('src/training.mjs'),await read('src/exit-survey.mjs'),await read('src/benefits.mjs'),await read('src/subscription.mjs'),await read('src/dashboard.mjs'),await read('src/admin.mjs'),(await read('src/api.mjs')).replace(/^import .*;\n/gm,'')].join('\n'));
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
