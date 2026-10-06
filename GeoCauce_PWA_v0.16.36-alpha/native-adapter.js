(() => {
  'use strict';
  const native = window.GeoCauceNative;
  window.GeoCauceAndroid = {
    available: !!native,
    info(){ try{return native?JSON.parse(native.platformInfo()||'{}'):{};}catch{return{};} },
    catalog(){ try{return native?JSON.parse(native.getProjectCatalog()||'[]'):[];}catch{return[];} },
    snapshot(id){ try{return native?JSON.parse(native.getProjectSnapshot(id)||'{}'):null;}catch{return null;} },
    stats(){ try{return native?JSON.parse(native.databaseStats()||'{}'):{};}catch{return{};} },
    requestLocation(){ try{native?.requestLocation();return true;}catch{return false;} },
    exportDb(){ try{return native?.exportDatabase?.()||'';}catch{return'';} }
  };
  window.__GeoCauceNative = !!native;
})();
