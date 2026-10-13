/* GeoCauce: global overlay stack, independent of each screen's stacking context. */
(() => {
  'use strict';
  const SELECTOR='.modal, .m-observation-sheet, .m-busy';
  const watched=new WeakSet(),openStates=new WeakMap();
  let order=100000;
  const isOpen=el=>!el.classList.contains('hidden');
  function track(el){
    if(!el.matches(SELECTOR)||watched.has(el))return;
    watched.add(el);
    // A dialog inside #mapScreen would otherwise inherit that screen's
    // stacking context and even disappear when another screen is shown.
    if(el.matches('.modal')&&el.parentElement!==document.body)
      document.body.appendChild(el);
    const refresh=()=>{
      const visible=isOpen(el),wasOpen=openStates.get(el)===true;
      if(visible&&!wasOpen){
        el.style.setProperty('z-index',String(++order),'important');
        openStates.set(el,true);
      }else if(!visible&&wasOpen){
        el.style.removeProperty('z-index');
        openStates.set(el,false);
      }
      el.setAttribute('aria-hidden',visible?'false':'true');
    };
    new MutationObserver(refresh).observe(el,{attributes:true,attributeFilter:['class']});
    refresh();
  }
  document.querySelectorAll(SELECTOR).forEach(track);
  // Mobile sheets/loading overlays are created on demand.
  new MutationObserver(records=>{
    for(const record of records)
      for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        if(node.matches(SELECTOR))track(node);
        node.querySelectorAll(SELECTOR).forEach(track);
      }
  }).observe(document.body,{childList:true,subtree:true});
})();
