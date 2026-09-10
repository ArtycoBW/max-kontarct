import { BOOT_PATH, BOOT_PROBE, bootDetails, bootStages } from "./boot-schema";

// Parser-executed inline code: independent of Next/React hydration and MAX SDK.
// Values inserted here are fixed enums or validated hex, never user input.
export function createBootScript(run: string): string {
  if (!/^[a-f0-9]{16}$/.test(run)) throw new Error("Invalid diagnostic run");
  return `(function(){try{
    if(window.__maxBootDiagnostic)return;
    var started=Date.now(),sent={},stopped=false,count=0;
    var stages=${JSON.stringify(bootStages)},details=${JSON.stringify(bootDetails)};
    var context=window.parent===window?'standalone':'embedded';
    function report(stage,detail){try{
      detail=detail||'none';var key=stage+':'+detail;
      if(stopped||sent[key]||count>=48||stages.indexOf(stage)<0||details.indexOf(detail)<0)return;
      var elapsed=Math.max(0,Date.now()-started);if(elapsed>30000)return;
      sent[key]=true;count++;
      var body=JSON.stringify({probe:${JSON.stringify(BOOT_PROBE)},run:${JSON.stringify(run)},stage:stage,detail:detail,elapsedMs:Math.round(elapsed/100)*100,context:context});
      fetch(${JSON.stringify(BOOT_PATH)},{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true,headers:{'Content-Type':'text/plain'},body:body}).catch(function(){});
    }catch(ignore){}}
    function errorKind(error){try{var name=error&&error.name;return ['TypeError','SyntaxError','SecurityError','ReferenceError','RangeError'].indexOf(name)>=0?name:'OtherError';}catch(ignore){return 'OtherError';}}
    function resourceKind(target){try{
      if(target.tagName==='SCRIPT')return target.src==='https://st.max.ru/js/max-web-app.js'?'sdk':'app-script';
      if(target.tagName==='LINK')return 'style';
      if(target.tagName==='IMG')return 'image';
    }catch(ignore){}return 'other-resource';}
    function onError(event){if(event.target&&event.target!==window){report('resource-error',resourceKind(event.target));}else{report('js-error',errorKind(event.error));}}
    function onReject(event){report('promise-error',errorKind(event.reason));}
    function onResourceLoad(event){if(event.target&&event.target.tagName==='SCRIPT'){report(resourceKind(event.target)==='sdk'?'sdk-loaded':'app-script-loaded');}}
    function onDom(){report('dom-ready');}
    function onLoad(){report('page-load');}
    function onHide(){report('pagehide');stop();}
    function stop(){stopped=true;window.removeEventListener('error',onError,true);window.removeEventListener('unhandledrejection',onReject);document.removeEventListener('load',onResourceLoad,true);document.removeEventListener('DOMContentLoaded',onDom);window.removeEventListener('load',onLoad);window.removeEventListener('pagehide',onHide);}
    window.__maxBootDiagnostic={report:report};
    window.addEventListener('error',onError,true);
    window.addEventListener('unhandledrejection',onReject);
    document.addEventListener('load',onResourceLoad,true);
    document.addEventListener('DOMContentLoaded',onDom);
    window.addEventListener('load',onLoad);
    window.addEventListener('pagehide',onHide);
    report('document-start');
    if(document.readyState!=='loading')onDom();
    if(document.readyState==='complete')onLoad();
    [5,12,18].forEach(function(seconds){setTimeout(function(){report('wait-'+seconds+'s');},seconds*1000);});
    setTimeout(function(){report('capture-end');stop();},25000);
  }catch(ignore){}})();`;
}
