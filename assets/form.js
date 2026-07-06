(function(){
  var GHL='https://6a281ed24f83faaed2904894.functions.base44.app/createGHLContact';
  document.addEventListener('DOMContentLoaded',function(){
    var form=document.getElementById('leadForm');
    if(!form)return;
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var btn=document.getElementById('qfSubmit');
      var ok=document.getElementById('qfSuccess');
      btn.disabled=true; btn.textContent='Submittingâ€¦';
      var fd=new FormData(form);
      fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fd).toString()})
      .then(function(){
        var p={};fd.forEach(function(v,k){p[k]=v;});
        fetch(GHL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}).catch(function(){});
        if(ok){ok.classList.add('show');ok.scrollIntoView({behavior:'smooth',block:'center'});}
        btn.style.display='none';
      })
      .catch(function(){
        btn.disabled=false; btn.textContent='Request My Free Quote â†’';
        alert('Something went wrong. Please try again or call (678) 562-6905.');
      });
    });
  });
})();