/**
 * CT-Merchant Ltd. Logic Handler
 */

// 1. Supabase Configuration
const SB_URL = 'https://goodtvrhszsnhcyigfoi.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdvb2R0dnJoc3pzbmhjeWlnZm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTIzMjEsImV4cCI6MjA4MDY4ODMyMX0.FM80U_YHA-DnPqMnD4oEiNGI07BSxGcHGqeH4JP1HlI'; 

let supabaseClient;
try {
  const { createClient } = supabase;
  supabaseClient = createClient(SB_URL, SB_KEY);
} catch(e) { 
  console.error("Supabase failed to initialize:", e); 
}

// 2. UI Elements
const modal = document.getElementById('login-modal');
const menu = document.getElementById('mobile-menu');
const menuBtn = document.getElementById('menu-btn');
const getStartedBtn = document.getElementById('get-started-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const togglePassBtn = document.getElementById('toggle-pass-btn');
const searchInput = document.getElementById('repo-search-input');
const searchBtnManual = document.getElementById('search-btn-manual');

// 3. Modal & Menu Toggles
function toggleLoginModal() { modal.classList.toggle('hidden'); }

if (menuBtn) menuBtn.onclick = () => menu.classList.toggle('hidden');
if (getStartedBtn) getStartedBtn.onclick = toggleLoginModal;
if (closeModalBtn) closeModalBtn.onclick = toggleLoginModal;

if (togglePassBtn) {
  togglePassBtn.onclick = () => {
    const passInput = document.getElementById("password");
    const eyeIcon = document.getElementById("eyeIcon");
    if (passInput.type === "password") {
      passInput.type = "text";
      eyeIcon.classList.add("text-brand-purple");
    } else {
      passInput.type = "password";
      eyeIcon.classList.remove("text-brand-purple");
    }
  };
}

// 4. Search Logic
function executeRedirect(query) {
  const cleanedQuery = query.trim();
  if (cleanedQuery) {
    window.location.href = `reposearch.html?merchantId=${encodeURIComponent(cleanedQuery)}`;
  }
}

if (searchInput) {
  searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') executeRedirect(e.target.value);
  };
}

if (searchBtnManual) {
  searchBtnManual.onclick = () => executeRedirect(searchInput.value);
}

// 5. Typewriter Effect
const textEl = document.getElementById("typewriter");
const phrases = ["Reliable.", "Trusted.", "Secured."];
let pIdx = 0, cIdx = 0, isDel = false;

function type() {
  if(!textEl) return;
  const cur = phrases[pIdx];
  textEl.textContent = cur.substring(0, isDel ? cIdx-- : cIdx++);
  
  if (!isDel && cIdx > cur.length) { 
    isDel = true; 
    setTimeout(type, 2000); 
  } else if (isDel && cIdx === 0) { 
    isDel = false; 
    pIdx = (pIdx + 1) % phrases.length; 
    setTimeout(type, 500); 
  } else {
    setTimeout(type, isDel ? 50 : 100);
  }
}
type();

// 6. Intersection Observer (Scroll Animations)
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => { 
    if(entry.isIntersecting) entry.target.classList.add('visible'); 
  });
}, { threshold: 0.1 });

document.querySelectorAll('.animate-up').forEach(el => observer.observe(el));

// 7. Login Authentication Logic
const loginForm = document.getElementById('loginForm');
if(loginForm) {
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const loader = document.getElementById('loginLoader');
    const errorMsg = document.getElementById('errorMsg');
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Reset UI
    btn.disabled = true; 
    loader.style.display = 'block'; 
    errorMsg.classList.add('hidden');

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if(error) throw error;
      window.location.href = '/user-dashboard.html';
    } catch(err) {
      errorMsg.textContent = err.message;
      errorMsg.classList.remove('hidden');
    } finally {
      btn.disabled = false; 
      loader.style.display = 'none';
    }
  };
}
