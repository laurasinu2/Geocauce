/* Minimal share dialog. Network and authorization are supplied by app.js.
 * All user-supplied fields are inserted with textContent (never innerHTML).
 */
(function(root){
 'use strict';
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
 function open({name,viewUrl,editUrl,list,invite,remove,onClose}){
  document.getElementById('geocauceSharingDialog')?.remove();
  const overlay=el('div',null,'geocauce-share-overlay');overlay.id='geocauceSharingDialog';
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Compartir proyecto');
  const panel=el('section',null,'geocauce-share-dialog');overlay.appendChild(panel);
  const heading=el('h2','Compartir · '+name);panel.appendChild(heading);
  const info=el('p','Comparte solo con personas que tengan cuenta en GeoCauce. Puedes cambiar o revocar el permiso en cualquier momento.');panel.appendChild(info);
  const form=el('form');panel.appendChild(form);
  const email=el('input');email.type='email';email.placeholder='Correo del colaborador';email.required=true;email.autocomplete='email';email.setAttribute('aria-label','Correo del colaborador');
  const role=el('select');role.setAttribute('aria-label','Permiso');
  [['viewer','Puede visualizar'],['editor','Puede editar']].forEach(([value,title])=>{const o=el('option',title);o.value=value;role.appendChild(o);});
  const send=el('button','Dar acceso');send.type='submit';form.append(email,role,send);
  const notice=el('p','', 'geocauce-share-status');notice.setAttribute('role','status');panel.appendChild(notice);
  const headingMembers=el('h3','Personas con acceso');panel.appendChild(headingMembers);
  const members=el('div');panel.appendChild(members);
  async function refresh(){
   members.replaceChildren();
   const rows=await list();
   if(!rows.length)members.appendChild(el('p','Todavía no hay colaboradores.'));
   rows.forEach(m=>{
    const row=el('div',null,'geocauce-share-member'),label=el('span',(m.email||m.user_id)+' · '+(m.role==='editor'?'Editor':'Visualizador'));
    const revoke=el('button','Revocar');revoke.type='button';
    revoke.onclick=async()=>{
     revoke.disabled=true;try{await remove(m.user_id);notice.textContent='Permiso revocado';await refresh();}
     catch(err){notice.textContent=err.message||String(err);}finally{revoke.disabled=false;}
    };
    row.append(label,revoke);members.appendChild(row);
   });
  }
  form.onsubmit=async e=>{
   e.preventDefault();send.disabled=true;notice.textContent='Comprobando usuario y permisos…';
   try{await invite(email.value.trim(),role.value);email.value='';notice.textContent='Acceso concedido';await refresh();}
   catch(err){notice.textContent=err.message||String(err);}finally{send.disabled=false;}
  };
  const links=el('div',null,'geocauce-share-links');panel.appendChild(links);
  for(const [label,url] of [['Copiar enlace de lectura',viewUrl],['Copiar enlace de edición',editUrl]]){
   const button=el('button',label);button.type='button';
   button.onclick=async()=>{try{await navigator.clipboard.writeText(url);notice.textContent='Enlace copiado. El destinatario necesitará permiso para abrirlo.';}
   catch{notice.textContent='Enlace: '+url;}};
   links.appendChild(button);
  }
  const close=el('button','Cerrar');close.type='button';close.className='geocauce-share-close';
  const dismiss=()=>{overlay.remove();onClose?.();};
  close.onclick=dismiss;panel.appendChild(close);
  overlay.onclick=e=>{if(e.target===overlay)dismiss();};
  document.addEventListener('keydown',function onKey(e){if(e.key==='Escape'){document.removeEventListener('keydown',onKey);if(overlay.isConnected)dismiss();}});
  document.body.appendChild(overlay);refresh().catch(err=>{notice.textContent=err.message||String(err);});
  email.focus();
  return overlay;
 }
 root.GeoCauceShareDialog={open};
})(typeof window!=='undefined'?window:globalThis);
