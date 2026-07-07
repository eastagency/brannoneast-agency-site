(function(){
'use strict';
var API='/.netlify/functions/chat';
var GHL='https://6a281ed24f83faaed2904894.functions.base44.app/createGHLContact';
var hist=[];
var ready=false;
var _leadEmail='';
var _leadName='';

function insuranceType(){
  var el=document.querySelector('input[name="policy_type"]');
  return el?el.value:'Auto Insurance';
}
function win(){return document.getElementById('chatWindow');}

function addMsg(txt,cls){
  var w=win(); if(!w)return;
  var d=document.createElement('div');
  d.className='chat-msg '+cls;
  d.textContent=txt;
  w.appendChild(d);
  w.scrollTop=w.scrollHeight;
}

function showTyping(){
  var w=win(); if(!w)return;
  var t=document.createElement('div');
  t.className='chat-typing'; t.id='chatTyping';
  t.innerHTML='<span></span><span></span><span></span>';
  w.appendChild(t); w.scrollTop=w.scrollHeight;
  var b=document.getElementById('chatSend'); if(b)b.disabled=true;
}

function hideTyping(){
  var t=document.getElementById('chatTyping'); if(t)t.remove();
  var b=document.getElementById('chatSend'); if(b)b.disabled=false;
}

function callAPI(msgs,cb){
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({messages:msgs,insuranceType:insuranceType()})})
  .then(function(r){return r.json();})
  .then(function(d){cb(null,d);})
  .catch(function(e){cb(e);});
}

function startChat(){
  if(ready)return; ready=true;
  showTyping();
  callAPI([],function(err,data){
    hideTyping();
    if(err){
      addMsg("Hi! I'm having a little trouble connecting. Use the Quick Form tab or call (678) 562-6905.",'bot');
      return;
    }
    addMsg(data.reply,'bot');
    hist.push({role:'assistant',content:data.reply});
  });
}

function sendMessage(){
  var inp=document.getElementById('chatInput'); if(!inp)return;
  var txt=inp.value.trim(); if(!txt)return;
  inp.value='';
  addMsg(txt,'user');
  hist.push({role:'user',content:txt});
  showTyping();
  callAPI(hist,function(err,data){
    hideTyping();
    if(err){addMsg("Something went wrong. Try again or call (678) 562-6905.",'bot');return;}
    addMsg(data.reply,'bot');
    if(data.formData){
      submitLead(data.formData);
    } else {
      hist.push({role:'assistant',content:data.reply});
    }
  });
}

function submitLead(fd){
  var form=document.getElementById('leadForm'); if(!form)return;
  _leadName=(fd.first_name||'')+' '+(fd.last_name||'');
  _leadEmail=fd.email||'';
  var params=new URLSearchParams();
  params.append('form-name',form.getAttribute('name'));
  Object.keys(fd).forEach(function(k){params.append(k,fd[k]);});
  fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()})
  .then(function(){
    fetch(GHL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fd)}).catch(function(){});
    var w=win(); if(w)w.style.display='none';
    var row=document.getElementById('chatInputRow'); if(row)row.style.display='none';
    var suc=document.getElementById('chatSuccess');
    if(suc){
      suc.classList.add('show');
      if(fd.wants_upload==='yes'){showUploadArea(suc);}
      suc.scrollIntoView({behavior:'smooth',block:'center'});
    }
  })
  .catch(function(){
    addMsg("Your info has been noted! Brannon will follow up within 24 hours.",'bot');
  });
}

function showUploadArea(container){
  var div=document.createElement('div');
  div.style.cssText='margin-top:20px;border-top:1.5px solid #d0e8e3;padding-top:18px;text-align:left';
  div.innerHTML=
    '<p style="font-weight:700;color:var(--teal,#0d9488);margin:0 0 6px;font-size:15px">Upload Your Declaration Pages</p>'+
    '<p style="font-size:13px;color:#666;margin:0 0 12px;line-height:1.5">Attach your current dec page(s) below — PDF, JPG, or PNG. Brannon will have them ready when he calls.</p>'+
    '<input type="file" id="decFiles" accept=".pdf,.jpg,.jpeg,.png" multiple style="font-size:13px;margin-bottom:12px;width:100%;cursor:pointer">'+
    '<br><button id="decUploadBtn" onclick="submitDecUpload()" style="background:var(--teal,#0d9488);color:#fff;border:none;border-radius:8px;padding:11px 22px;font-weight:700;cursor:pointer;font-size:14px;font-family:Poppins,sans-serif">Send Files to Brannon</button>'+
    '<p id="decUploadStatus" style="font-size:13px;margin-top:10px;color:#555"></p>';
  container.appendChild(div);
}

window.submitDecUpload=function(){
  var files=document.getElementById('decFiles').files;
  var status=document.getElementById('decUploadStatus');
  var btn=document.getElementById('decUploadBtn');
  if(!files||!files.length){status.textContent='Please select at least one file first.';return;}
  btn.disabled=true; btn.textContent='Uploading...';
  var fd=new FormData();
  fd.append('form-name','dec-upload');
  fd.append('lead_name',_leadName);
  fd.append('lead_email',_leadEmail);
  for(var i=0;i<files.length;i++){fd.append('file_'+(i+1),files[i]);}
  fetch('/',{method:'POST',body:fd})
  .then(function(){
    status.textContent='Files sent! Brannon will have them ready when he calls.';
    btn.style.display='none';
  })
  .catch(function(){
    status.textContent='Upload failed — please email your dec pages to info@brannoneastagency.com';
    btn.disabled=false; btn.textContent='Try Again';
  });
};

document.addEventListener('DOMContentLoaded',function(){
  var tabs=document.querySelectorAll('.quote-tab');
  tabs.forEach(function(tab){
    tab.addEventListener('click',function(){
      tabs.forEach(function(t){t.classList.remove('active');});
      document.querySelectorAll('.quote-panel').forEach(function(p){p.classList.remove('active');});
      tab.classList.add('active');
      var panel=document.getElementById(tab.dataset.panel);
      if(panel)panel.classList.add('active');
      if(tab.dataset.panel==='panel-chat'&&!ready)startChat();
    });
  });
  var inp=document.getElementById('chatInput');
  if(inp)inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendMessage();}});
  var cp=document.getElementById('panel-chat');
  if(cp&&cp.classList.contains('active'))startChat();
});

window.sendChatMessage=sendMessage;
})();
