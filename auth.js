// Shared authentication for Broken Card Hauls.
// Use your Supabase Project URL and Publishable key (never a secret key).
const SUPABASE_URL ="https://wnbgyjiftqhehhmfqmit.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RFIUTjjbp4Y3pLoMb_CzlA_Ps3uNpPJ";

const authClientReady = window.supabase &&
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_");

const authClient = authClientReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

function showAuthMessage(id, message, kind = "") {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = message;
    el.className = "status " + kind;
  }
}

const signUpForm = document.getElementById("signUpForm");
if (signUpForm) {
  signUpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!authClient) {
      showAuthMessage("signupMessage", "Setup needed: add your Supabase Project URL and Publishable key in auth.js.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showAuthMessage("signupMessage", "Your passwords don't match. Try again.", "error");
      return;
    }
    if (password.length < 6) {
      showAuthMessage("signupMessage", "Use a password with at least 6 characters.", "error");
      return;
    }

    const button = document.getElementById("createAccountBtn");
    button.disabled = true;
    showAuthMessage("signupMessage", "Creating your account…");
    const { data, error } = await authClient.auth.signUp({ email, password });
    button.disabled = false;

    if (error) {
      showAuthMessage("signupMessage", error.message, "error");
      return;
    }
    if (data.session) {
      showAuthMessage("signupMessage", "Account created! Taking you to your spellbook…", "ok");
      window.location.href = "index.html";
    } else {
      showAuthMessage("signupMessage", "Account created/requested! Check your email for a confirmation link, then sign in.", "ok");
    }
  });
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authClient) {
      showAuthMessage("loginMessage", "Setup needed: add your Supabase Project URL and Publishable key in auth.js.", "error");
      return;
    }
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    showAuthMessage("loginMessage", "Signing in…");
    const { error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) {
      showAuthMessage("loginMessage", error.message, "error");
      return;
    }
    window.location.href = "index.html";
  });
}
