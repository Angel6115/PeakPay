/* Wallet de créditos (localStorage) */
(() => {
    const KEY = 'pp_wallet_v1';
  
    function read(){
      try { return JSON.parse(localStorage.getItem(KEY)) || { credits:0 }; }
      catch { return { credits:0 }; }
    }
    function write(w){ try{ localStorage.setItem(KEY, JSON.stringify(w)); }catch{} }
  
    const Wallet = {
      get(){ return read(); },
      credits(){ return read().credits || 0; },
      add(n){ const w=read(); w.credits=(w.credits||0)+Number(n||0); write(w); return w.credits; },
      spend(n){
        const need = Number(n||0);
        const w = read();
        if ((w.credits||0) < need) return false;
        w.credits -= need; write(w); return true;
      },
      reset(){ write({credits:0}); },
    };
  
    // Exponer global
    window.PeekWallet = Wallet;
  })();
  