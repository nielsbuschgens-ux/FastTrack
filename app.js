/**
 * ANTIGRAVITY FITNESS TRACKER
 * Stack: Vanilla JS, localStorage (demo) / Supabase, Chart.js
 */

// --- 1. Config & backend selection ---
const appConfig = window.APP_CONFIG || {};
const supabaseUrl = appConfig.SUPABASE_URL || '';
const supabaseKey = appConfig.SUPABASE_KEY || '';
const DEMO_MODE = appConfig.DEMO_MODE === true || !supabaseUrl || !supabaseKey;

let supabaseClient = null;
if (!DEMO_MODE && window.supabase) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            storage: window.localStorage
        }
    });
}

// --- 2. Local demo storage ---
const LocalStore = {
    KEYS: {
        user: 'fasttrack_demo_user',
        exercises: 'fasttrack_demo_exercises',
        logs: 'fasttrack_demo_logs'
    },

    getUser() {
        try { return JSON.parse(localStorage.getItem(this.KEYS.user)); } catch { return null; }
    },

    setUser(user) {
        localStorage.setItem(this.KEYS.user, JSON.stringify(user));
    },

    clearUser() {
        localStorage.removeItem(this.KEYS.user);
    },

    getExercises() {
        try { return JSON.parse(localStorage.getItem(this.KEYS.exercises)) || []; } catch { return []; }
    },

    setExercises(exercises) {
        localStorage.setItem(this.KEYS.exercises, JSON.stringify(exercises));
    },

    getLogs() {
        try { return JSON.parse(localStorage.getItem(this.KEYS.logs)) || []; } catch { return []; }
    },

    setLogs(logs) {
        localStorage.setItem(this.KEYS.logs, JSON.stringify(logs));
    },

    uid() {
        return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
};

function createLocalDB() {
    return {
        exercises: [],

        async getSession() {
            const user = LocalStore.getUser();
            return user ? { user } : null;
        },

        async signInDemo(name) {
            const user = {
                id: 'demo-user',
                email: 'demo@fasttrack.local',
                user_metadata: { full_name: name }
            };
            LocalStore.setUser(user);
            return { user };
        },

        async signOut() {
            LocalStore.clearUser();
        },

        async saveLog(log) {
            const session = await this.getSession();
            if (!session) return;

            const entry = {
                id: LocalStore.uid(),
                user_id: session.user.id,
                exercise_id: log.exerciseId,
                weight: parseFloat(log.weight),
                reps: parseInt(log.reps, 10),
                created_at: new Date().toISOString()
            };
            const logs = LocalStore.getLogs();
            logs.push(entry);
            LocalStore.setLogs(logs);
        },

        async getLogsForExercise(exerciseId) {
            return LocalStore.getLogs()
                .filter(l => l.exercise_id === exerciseId)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        },

        async deleteLog(logId) {
            LocalStore.setLogs(LocalStore.getLogs().filter(l => l.id !== logId));
        },

        async getExercises() {
            return [...LocalStore.getExercises()].sort(
                (a, b) => new Date(a.created_at) - new Date(b.created_at)
            );
        },

        async saveExercise(exercise) {
            const session = await this.getSession();
            if (!session) return;

            const entry = {
                id: LocalStore.uid(),
                user_id: session.user.id,
                name: exercise.name,
                category: exercise.category,
                created_at: new Date().toISOString()
            };
            const exercises = LocalStore.getExercises();
            exercises.push(entry);
            LocalStore.setExercises(exercises);
            return entry;
        },

        async deleteExercise(id) {
            LocalStore.setExercises(LocalStore.getExercises().filter(ex => ex.id !== id));
            LocalStore.setLogs(LocalStore.getLogs().filter(l => l.exercise_id !== id));
        },

        async seedDemoData() {
            const defaults = [
                { category: 'Push', name: 'Bench Press' },
                { category: 'Push', name: 'Shoulder Press' },
                { category: 'Push', name: 'Tricep Pushdown' },
                { category: 'Pull', name: 'Pull Ups' },
                { category: 'Pull', name: 'Barbell Row' },
                { category: 'Pull', name: 'Bicep Curl' },
                { category: 'Legs', name: 'Squat' },
                { category: 'Legs', name: 'Leg Press' },
                { category: 'Legs', name: 'Hamstring Curl' }
            ];

            const now = Date.now();
            const exercises = defaults.map((item, i) => ({
                id: `demo-ex-${i}`,
                user_id: 'demo-user',
                name: item.name,
                category: item.category,
                created_at: new Date(now - (defaults.length - i) * 86400000).toISOString()
            }));
            LocalStore.setExercises(exercises);

            const bench = exercises.find(ex => ex.name === 'Bench Press');
            const squat = exercises.find(ex => ex.name === 'Squat');
            const demoLogs = [
                { exercise_id: bench.id, weight: 60, reps: 10, daysAgo: 28 },
                { exercise_id: bench.id, weight: 65, reps: 8, daysAgo: 21 },
                { exercise_id: bench.id, weight: 70, reps: 8, daysAgo: 14 },
                { exercise_id: bench.id, weight: 72.5, reps: 6, daysAgo: 7 },
                { exercise_id: bench.id, weight: 75, reps: 6, daysAgo: 2 },
                { exercise_id: squat.id, weight: 80, reps: 8, daysAgo: 20 },
                { exercise_id: squat.id, weight: 90, reps: 6, daysAgo: 10 },
                { exercise_id: squat.id, weight: 100, reps: 5, daysAgo: 3 }
            ].map((item, i) => ({
                id: `demo-log-${i}`,
                user_id: 'demo-user',
                exercise_id: item.exercise_id,
                weight: item.weight,
                reps: item.reps,
                created_at: new Date(now - item.daysAgo * 86400000).toISOString()
            }));
            LocalStore.setLogs(demoLogs);
        }
    };
}

function createSupabaseDB() {
    return {
        exercises: [],

        async getSession() {
            const { data: { session } } = await supabaseClient.auth.getSession();
            return session;
        },

        async saveLog(log) {
            const session = await this.getSession();
            if (!session) return;

            const { error } = await supabaseClient
                .from('fitness_logs')
                .insert({
                    user_id: session.user.id,
                    exercise_id: log.exerciseId,
                    weight: parseFloat(log.weight),
                    reps: parseInt(log.reps, 10)
                });

            if (error) {
                console.error("Save Error:", error);
                throw error;
            }
        },

        async getLogsForExercise(exerciseId) {
            const session = await this.getSession();
            if (!session) return [];

            const { data, error } = await supabaseClient
                .from('fitness_logs')
                .select('*')
                .eq('exercise_id', exerciseId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Fetch Error:", error);
                return [];
            }
            return data;
        },

        async deleteLog(logId) {
            const session = await this.getSession();
            if (!session) return;

            const { error } = await supabaseClient
                .from('fitness_logs')
                .delete()
                .eq('id', logId)
                .eq('user_id', session.user.id);

            if (error) {
                console.error("Delete Error:", error);
                throw error;
            }
        },

        async getExercises() {
            const session = await this.getSession();
            if (!session) return [];

            const { data, error } = await supabaseClient
                .from('fitness_exercises')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.error("Fetch Exercises Error:", error);
                return [];
            }
            return data;
        },

        async saveExercise(exercise) {
            const session = await this.getSession();
            if (!session) return;

            const { data, error } = await supabaseClient
                .from('fitness_exercises')
                .insert({
                    user_id: session.user.id,
                    name: exercise.name,
                    category: exercise.category
                })
                .select();

            if (error) {
                console.error("Save Exercise Error:", error);
                throw error;
            }
            return data[0];
        },

        async deleteExercise(id) {
            const session = await this.getSession();
            if (!session) return;

            const { error } = await supabaseClient
                .from('fitness_exercises')
                .delete()
                .eq('id', id)
                .eq('user_id', session.user.id);

            if (error) {
                console.error("Delete Exercise Error:", error);
                throw error;
            }
        }
    };
}

const DB = DEMO_MODE ? createLocalDB() : createSupabaseDB();

// --- 2. Global State ---
const SESSION_KEY = 'fasttrack_session';
const REST_KEY = 'fasttrack_rest_seconds';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_WEIGHT = 500;
const MAX_REPS = 100;
const SPLITS = ['Push', 'Pull', 'Legs'];
const EXERCISE_SUGGESTIONS = {
    Push: ['Bench Press', 'Incline Bench Press', 'Incline Dumbbell Press', 'Dumbbell Bench Press', 'Shoulder Press', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Chest Fly', 'Cable Crossover', 'Dips', 'Tricep Pushdown', 'Overhead Tricep Extension', 'Skull Crushers', 'Push Ups'],
    Pull: ['Pull Ups', 'Chin Ups', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Seated Cable Row', 'T-Bar Row', 'Face Pull', 'Rear Delt Fly', 'Deadlift', 'Bicep Curl', 'Hammer Curl', 'Preacher Curl', 'Shrugs'],
    Legs: ['Squat', 'Front Squat', 'Leg Press', 'Romanian Deadlift', 'Hamstring Curl', 'Leg Extension', 'Bulgarian Split Squat', 'Lunges', 'Hip Thrust', 'Calf Raise', 'Hack Squat', 'Goblet Squat']
};

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isSameDay(a, b) {
    return new Date(a).toDateString() === new Date(b).toDateString();
}

function daysAgoLabel(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86400000);
    if (diff <= 0) return 'vandaag';
    if (diff === 1) return 'gisteren';
    if (diff < 7) return `${diff} dagen geleden`;
    return day.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function formatKg(n) {
    return Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

function formatInputNumber(n) {
    return String(Number(n)).replace('.', ',');
}

const state = {
    currentCategory: null,
    currentExercise: null,
    weight: 0,
    reps: 0,
    lastLog: null,
    chart: null,
    globalChart: null,
    authMode: 'login', // 'login' or 'register'
    passwordRecovery: false,
    theme: localStorage.getItem('fasttrack_theme') || 'dark',
    exercisesChannel: null,
    logsChannel: null,
    restTimerId: null,
    restSecondsLeft: 0,
    // Session tracking
    sessionVolume: 0,           // totaal kg verplaatst deze sessie
    sessionSets: 0,             // totaal sets deze sessie
    sessionExercises: {},       // { exerciseId: { name, volume, sets } }
    exerciseVolume: 0,          // volume voor huidige oefening
    exerciseSets: 0,            // sets voor huidige oefening
    allTimePRs: {},             // { exerciseId: maxWeight }
    sessionStartedAt: null,     // timestamp van eerste set
    logsCache: {},              // { exerciseId: logs (nieuwste eerst) }
    restDefault: parseInt(localStorage.getItem(REST_KEY), 10) || 180,
    dirty: false,               // gebruiker heeft gewicht/reps zelf aangepast
    saving: false,
    toastTimeout: null
};

// --- 3. UI Logic ---
const app = {
    async start() {
        console.log(DEMO_MODE ? "Application started (demo mode)." : "Application started.");

        if (DEMO_MODE) {
            this.setupDemoUI();
        } else if (!supabaseUrl || !supabaseKey) {
            console.error("Supabase configuration missing!");
            this.showAuthError("Configuratie error: SUPABASE_URL of KEY ontbreekt.");
            return;
        }

        if (state.theme === 'light') {
            document.documentElement.classList.add('light-theme');
        }

        if (!DEMO_MODE) {
            supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (event === 'PASSWORD_RECOVERY') {
                    state.passwordRecovery = true;
                    this.navTo('reset');
                    return;
                }
                if (event === 'SIGNED_OUT') {
                    state.passwordRecovery = false;
                }
            });
        }

        try {
            if (DEMO_MODE) {
                const session = await DB.getSession();
                if (session && session.user) {
                    await this.handleSuccessfulAuth(session.user);
                }
                return;
            }

            // Recovery links land with type=recovery in hash or query
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const queryParams = new URLSearchParams(window.location.search);
            const isRecovery =
                hashParams.get('type') === 'recovery' ||
                queryParams.get('type') === 'recovery';

            const { data: { session } } = await supabaseClient.auth.getSession();

            if (isRecovery || state.passwordRecovery) {
                state.passwordRecovery = true;
                if (session) {
                    this.navTo('reset');
                    return;
                }
            }

            if (session && session.user) {
                await this.handleSuccessfulAuth(session.user);
            }
        } catch (e) {
            console.warn("Session check failed, likely not logged in:", e.message);
        }
    },

    setupDemoUI() {
        const subtitle = document.getElementById('auth-subtitle');
        const nameInput = document.getElementById('name-input');
        const emailInput = document.getElementById('email-input');
        const passwordInput = document.getElementById('password-input');
        const actionText = document.getElementById('auth-action-text');
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const forgotBtn = document.getElementById('forgot-password-btn');

        subtitle.innerText = 'Demo modus — vul je naam in';
        subtitle.style.color = '';
        nameInput.style.display = 'block';
        nameInput.placeholder = 'Je naam (bijv. Alex)';
        emailInput.style.display = 'none';
        passwordInput.style.display = 'none';
        actionText.innerText = 'Start demo';
        toggleBtn.style.display = 'none';
        if (forgotBtn) forgotBtn.style.display = 'none';
    },

    showForgotPassword() {
        if (DEMO_MODE) return;
        document.getElementById('forgot-error-msg').style.display = 'none';
        document.getElementById('forgot-email-input').value =
            document.getElementById('email-input').value || '';
        this.navTo('forgot');
    },

    showForgotMsg(message, isSuccess = false) {
        const el = document.getElementById('forgot-error-msg');
        el.innerText = message;
        el.style.display = 'block';
        el.style.color = isSuccess ? '#00ffa3' : '#ff4d4f';
    },

    showResetMsg(message, isSuccess = false) {
        const el = document.getElementById('reset-error-msg');
        el.innerText = message;
        el.style.display = 'block';
        el.style.color = isSuccess ? '#00ffa3' : '#ff4d4f';
    },

    async sendPasswordReset() {
        if (DEMO_MODE || !supabaseClient) return;

        const email = document.getElementById('forgot-email-input').value
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();

        if (!email) {
            this.showForgotMsg('Vul je e-mailadres in.');
            return;
        }

        const btn = document.getElementById('forgot-btn');
        const actionSpan = document.getElementById('forgot-action-text');
        const originalText = actionSpan.innerText;
        actionSpan.innerText = 'Bezig...';
        btn.disabled = true;
        document.getElementById('forgot-error-msg').style.display = 'none';

        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/`
            });
            if (error) throw error;
            this.showForgotMsg('Check je e-mail voor de reset-link.', true);
        } catch (err) {
            console.error('Password reset error:', err);
            this.showForgotMsg(err.message || 'Kon geen reset-mail versturen.');
        } finally {
            actionSpan.innerText = originalText;
            btn.disabled = false;
        }
    },

    async submitNewPassword() {
        if (DEMO_MODE || !supabaseClient) return;

        const password = document.getElementById('reset-password-input').value.trim();
        const confirm = document.getElementById('reset-password-confirm').value.trim();

        if (!password || !confirm) {
            this.showResetMsg('Vul beide velden in.');
            return;
        }
        if (password.length < 6) {
            this.showResetMsg('Wachtwoord moet uit minstens 6 tekens bestaan.');
            return;
        }
        if (password !== confirm) {
            this.showResetMsg('Wachtwoorden komen niet overeen.');
            return;
        }

        const btn = document.getElementById('reset-btn');
        const actionSpan = document.getElementById('reset-action-text');
        const originalText = actionSpan.innerText;
        actionSpan.innerText = 'Opslaan...';
        btn.disabled = true;
        document.getElementById('reset-error-msg').style.display = 'none';

        try {
            const { data, error } = await supabaseClient.auth.updateUser({ password });
            if (error) throw error;

            state.passwordRecovery = false;
            // Clean recovery tokens from the URL
            if (window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            this.showResetMsg('Wachtwoord bijgewerkt!', true);
            document.getElementById('reset-password-input').value = '';
            document.getElementById('reset-password-confirm').value = '';

            setTimeout(async () => {
                if (data && data.user) {
                    await this.handleSuccessfulAuth(data.user);
                } else {
                    this.navTo('login');
                }
            }, 800);
        } catch (err) {
            console.error('Update password error:', err);
            let msg = err.message || 'Kon wachtwoord niet wijzigen.';
            if (msg.includes('same as the old')) msg = 'Kies een ander wachtwoord dan je huidige.';
            this.showResetMsg(msg);
        } finally {
            actionSpan.innerText = originalText;
            btn.disabled = false;
        }
    },

    toggleTheme() {
        if (state.theme === 'dark') {
            document.documentElement.classList.add('light-theme');
            state.theme = 'light';
            document.getElementById('theme-icon').name = 'moon-outline';
        } else {
            document.documentElement.classList.remove('light-theme');
            state.theme = 'dark';
            document.getElementById('theme-icon').name = 'sunny-outline';
        }
        localStorage.setItem('fasttrack_theme', state.theme);
        
        // Rerender chart alleen als het statistiekenscherm zichtbaar is
        if (state.chart && state.currentExercise && document.getElementById('screen-stats').classList.contains('active')) {
            this.showStats();
        }
    },

    toggleAuthMode() {
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        
        const subtitle = document.getElementById('auth-subtitle');
        const actionText = document.getElementById('auth-action-text');
        const nameInput = document.getElementById('name-input');
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const errorMsg = document.getElementById('auth-error-msg');
        
        errorMsg.style.display = 'none'; // clear errors on toggle

        if (state.authMode === 'login') {
            subtitle.innerText = 'FastTrack your Progress';
            actionText.innerText = 'Login';
            toggleBtn.innerText = 'Nog geen account? Registreer hier';
            nameInput.style.display = 'none';
        } else {
            subtitle.innerText = 'Account Aanmaken';
            actionText.innerText = 'Registreer';
            toggleBtn.innerText = 'Al een account? Log in';
            nameInput.style.display = 'block';
            nameInput.focus();
        }
    },

    showAuthError(message, isSuccess = false) {
        const errorMsg = document.getElementById('auth-error-msg');
        errorMsg.innerText = message;
        errorMsg.style.display = 'block';
        errorMsg.style.color = isSuccess ? '#00ffa3' : '#ff4d4f';
    },

    async handleAuth() {
        const emailInput = document.getElementById('email-input').value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        const nameInputVal = document.getElementById('name-input').value.trim();
        const passwordInput = document.getElementById('password-input').value.trim();

        if (DEMO_MODE) {
            if (!nameInputVal) {
                this.showAuthError('Vul je naam in om te starten.');
                return;
            }

            const btn = document.getElementById('login-btn');
            const actionSpan = document.getElementById('auth-action-text');
            const originalText = actionSpan.innerText;
            actionSpan.innerHTML = 'Laden... <ion-icon name="hourglass-outline"></ion-icon>';
            btn.disabled = true;

            try {
                const { user } = await DB.signInDemo(nameInputVal);
                await this.handleSuccessfulAuth(user);
                document.getElementById('name-input').value = '';
            } catch (err) {
                this.showAuthError('Demo kon niet starten.');
            } finally {
                actionSpan.innerText = originalText;
                btn.disabled = false;
            }
            return;
        }
        
        if (!emailInput || !passwordInput || (state.authMode === 'register' && !nameInputVal)) {
            this.showAuthError('Vul alle velden in.');
            return;
        }

        const btn = document.getElementById('login-btn');
        const actionSpan = document.getElementById('auth-action-text');
        const originalText = actionSpan.innerText;
        actionSpan.innerHTML = 'Laden... <ion-icon name="hourglass-outline"></ion-icon>';
        btn.disabled = true;
        document.getElementById('auth-error-msg').style.display = 'none';

        try {
            let authData = null;
            let authError = null;

            if (state.authMode === 'login') {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: emailInput,
                    password: passwordInput
                });
                authData = data;
                authError = error;
            } else {
                const { data, error } = await supabaseClient.auth.signUp({
                    email: emailInput,
                    password: passwordInput,
                    options: {
                        data: { full_name: nameInputVal }
                    }
                });
                authData = data;
                authError = error;
            }

            if (authError) {
                throw authError;
            }

            if (authData && authData.user) {
                if (state.authMode === 'register' && !authData.session) {
                    this.showAuthError('Check je e-mail om je account te bevestigen!', true);
                    // Switch back to login for them
                    setTimeout(() => this.toggleAuthMode(), 3000);
                } else {
                    await this.handleSuccessfulAuth(authData.user);
                    document.getElementById('email-input').value = '';
                    document.getElementById('password-input').value = '';
                    document.getElementById('name-input').value = '';
                }
            }
        } catch (err) {
            console.error("Auth process error:", err);
            let userMsg = err.message || "Er ging iets mis.";
            if (err.message.includes('Invalid login credentials')) userMsg = "E-mail of wachtwoord is onjuist.";
            if (err.message.includes('Password should be at least')) userMsg = "Wachtwoord moet uit minstens 6 tekens bestaan.";
            if (err.message.includes('already registered')) userMsg = "Met dit e-mailadres is al een account geregistreerd.";
            
            this.showAuthError(userMsg);
        } finally {
            actionSpan.innerText = originalText;
            btn.disabled = false;
        }
    },

    async handleSuccessfulAuth(user) {
        if (state.passwordRecovery) {
            this.navTo('reset');
            return;
        }

        console.log("Logged in successfully as", user.email || user.user_metadata?.full_name);

        if (!DEMO_MODE) {
            if (state.exercisesChannel) {
                state.exercisesChannel.unsubscribe();
                state.exercisesChannel = null;
            }

            state.exercisesChannel = supabaseClient
                .channel('public:fitness_exercises')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'fitness_exercises' }, async () => {
                    console.log("Exercises updated in Supabase, refreshing...");
                    DB.exercises = await DB.getExercises();
                    if (document.getElementById('screen-workout').classList.contains('active')) {
                        this.renderExerciseList();
                    }
                })
                .subscribe((status) => {
                    console.log("Exercises sub status:", status);
                    this.updateSyncIndicator(status === 'SUBSCRIBED');
                });

            state.logsChannel = supabaseClient
                .channel('public:fitness_logs')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'fitness_logs' }, async (payload) => {
                    console.log("Logs updated in Supabase:", payload);
                    if (state.currentExercise && (
                        (payload.new && payload.new.exercise_id === state.currentExercise.id) || 
                        (payload.old && payload.old.exercise_id === state.currentExercise.id)
                    )) {
                        this.manualSyncLogs();
                    }
                    if (document.getElementById('screen-global-progress').classList.contains('active')) {
                        this.renderGlobalProgress();
                    }
                })
                .subscribe();
        } else {
            this.updateSyncIndicator(true);
        }

        const displayName = (user.user_metadata && user.user_metadata.full_name) || (user.email ? user.email.split('@')[0] : 'Demo');
        document.getElementById('display-username').innerText = displayName;

        let customExercises = await DB.getExercises();

        if (customExercises.length === 0) {
            if (DEMO_MODE) {
                await DB.seedDemoData();
                customExercises = await DB.getExercises();
            } else {
                const defaultNames = [
                    { category: 'Push', name: 'Bench Press' },
                    { category: 'Push', name: 'Shoulder Press' },
                    { category: 'Push', name: 'Tricep Pushdown' },
                    { category: 'Pull', name: 'Pull Ups' },
                    { category: 'Pull', name: 'Barbell Row' },
                    { category: 'Pull', name: 'Bicep Curl' },
                    { category: 'Legs', name: 'Squat' },
                    { category: 'Legs', name: 'Leg Press' },
                    { category: 'Legs', name: 'Hamstring Curl' }
                ];
                
                await Promise.all(defaultNames.map(item => DB.saveExercise(item)));
                customExercises = await DB.getExercises();
            }
        }

        DB.exercises = customExercises;
        this.restoreSession();

        // Laatste prestaties ophalen voor "aanbevolen" split en voorinvullen (niet blokkerend)
        this.loadLogsFor(DB.exercises).then(() => {
            if (document.getElementById('screen-launch').classList.contains('active')) this.renderLaunch();
        });

        // Apply theme icon properly after login
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.name = state.theme === 'light' ? 'moon-outline' : 'sunny-outline';
        }

        this.navTo('launch');
    },

    async logout() {
        if (state.exercisesChannel) {
            state.exercisesChannel.unsubscribe();
            state.exercisesChannel = null;
        }
        if (state.logsChannel) {
            state.logsChannel.unsubscribe();
            state.logsChannel = null;
        }
        if (DEMO_MODE) {
            await DB.signOut();
        } else {
            await supabaseClient.auth.signOut();
        }
        // Lopende sessie en cache horen bij deze gebruiker
        this.dismissRestTimer();
        state.sessionVolume = 0;
        state.sessionSets = 0;
        state.sessionExercises = {};
        state.sessionStartedAt = null;
        state.currentExercise = null;
        state.logsCache = {};
        state.allTimePRs = {};
        this.persistSession();
        if (DEMO_MODE) {
            this.setupDemoUI();
        } else {
            state.passwordRecovery = false;
            state.authMode = 'login';
            const subtitle = document.getElementById('auth-subtitle');
            const actionText = document.getElementById('auth-action-text');
            const nameInput = document.getElementById('name-input');
            const toggleBtn = document.getElementById('auth-toggle-btn');
            const forgotBtn = document.getElementById('forgot-password-btn');
            if (subtitle) subtitle.innerText = 'FastTrack your Progress';
            if (actionText) actionText.innerText = 'Login';
            if (nameInput) nameInput.style.display = 'none';
            if (toggleBtn) {
                toggleBtn.style.display = 'inline';
                toggleBtn.innerText = 'Nog geen account? Registreer hier';
            }
            if (forgotBtn) forgotBtn.style.display = 'inline';
        }
        this.navTo('login');
    },

    navTo(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(`screen-${screenId}`);
        if (screen) screen.classList.add('active');

        // Setup Bottom Nav visibility Context
        const nav = document.querySelector('.bottom-nav');
        if (screenId === 'launch' || screenId === 'global-progress') {
            nav.style.display = 'flex';
        } else {
            // Hide bottom nav when deep inside workout flows / auth screens
            nav.style.display = 'none';
        }

        // Schermen altijd met verse data tonen
        if (screenId === 'launch') this.renderLaunch();
        if (screenId === 'workout' && state.currentCategory) this.renderExerciseList();
    },

    navToMode(screenId, btnElement) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');
        this.navTo(screenId);
    },

    updateSyncIndicator(isOnline) {
        const dot = document.getElementById('sync-indicator');
        if (dot) dot.className = `sync-status ${isOnline ? 'online' : ''}`;
    },

    async manualSyncExercises(evt) {
        const btn = evt && evt.currentTarget;
        const icon = btn ? btn.querySelector('ion-icon') : null;
        if (icon) icon.classList.add('syncing-anim');

        try {
            DB.exercises = await DB.getExercises();
            await this.loadLogsFor(this.exercisesForCategory(state.currentCategory));
            this.renderExerciseList();
            this.showToast('Lijst Ververst! 🔄');
        } finally {
            if (icon) setTimeout(() => icon.classList.remove('syncing-anim'), 500);
        }
    },

    async manualSyncLogs() {
        if (!state.currentExercise) return;
        const exId = state.currentExercise.id;
        const logs = await DB.getLogsForExercise(exId);
        this.cacheLogs(exId, logs);

        if (document.getElementById('screen-log').classList.contains('active')) {
            if (!state.dirty) this.prepareNextSet();
            this.renderLogScreen();
        }
        if (document.getElementById('screen-stats').classList.contains('active')) {
            this.showStats();
        }
    },

    // --- Data helpers ---
    exercisesForCategory(category) {
        return (DB.exercises || []).filter(ex => ex.category === category);
    },

    cacheLogs(exId, logs) {
        state.logsCache[exId] = logs || [];
        state.lastLog = state.currentExercise && state.currentExercise.id === exId
            ? (state.logsCache[exId][0] || null)
            : state.lastLog;
        if (state.logsCache[exId].length > 0) {
            state.allTimePRs[exId] = Math.max(...state.logsCache[exId].map(l => Number(l.weight)));
        } else {
            delete state.allTimePRs[exId];
        }
    },

    async loadLogsFor(exercises) {
        const results = await Promise.all(exercises.map(ex =>
            DB.getLogsForExercise(ex.id).then(logs => [ex.id, logs]).catch(() => [ex.id, []])
        ));
        results.forEach(([id, logs]) => this.cacheLogs(id, logs));
    },

    sessionEntries(exId) {
        const se = state.sessionExercises[exId];
        return se && se.entries ? se.entries : [];
    },

    // Sets van de laatste eerdere training (zelfde dag als meest recente log buiten deze sessie)
    getPreviousSession(exId) {
        const logs = state.logsCache[exId] || [];
        const sessionIds = new Set(this.sessionEntries(exId).map(e => e.id).filter(Boolean));
        const older = logs.filter(l => !sessionIds.has(l.id));
        if (older.length === 0) return null;
        const ref = older[0].created_at;
        const sets = older.filter(l => isSameDay(l.created_at, ref)).reverse();
        return { date: ref, sets };
    },

    // Slimme suggestie: gewicht van je vorige set vandaag, reps-doel van vorige keer
    suggestNextSet(exId) {
        const entries = this.sessionEntries(exId);
        const prev = this.getPreviousSession(exId);
        const n = entries.length;
        const prevSet = prev ? prev.sets[n] : null;

        if (n > 0) {
            const last = entries[n - 1];
            return { weight: last.weight, reps: prevSet ? Number(prevSet.reps) : last.reps };
        }
        if (prev && prev.sets.length > 0) {
            const first = prev.sets[0];
            return { weight: Number(first.weight), reps: Number(first.reps) };
        }
        return { weight: 20, reps: 10 };
    },

    prepareNextSet() {
        if (!state.currentExercise) return;
        const next = this.suggestNextSet(state.currentExercise.id);
        state.weight = next.weight;
        state.reps = next.reps;
        state.dirty = false;
    },

    // --- Session persistence (overleeft herstart van de app) ---
    persistSession() {
        if (state.sessionSets > 0) {
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                category: state.currentCategory,
                startedAt: state.sessionStartedAt,
                sessionVolume: state.sessionVolume,
                sessionSets: state.sessionSets,
                sessionExercises: state.sessionExercises
            }));
        } else {
            localStorage.removeItem(SESSION_KEY);
        }
    },

    restoreSession() {
        try {
            const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
            if (!saved || !saved.startedAt || Date.now() - saved.startedAt > SESSION_MAX_AGE_MS) {
                localStorage.removeItem(SESSION_KEY);
                return;
            }
            state.currentCategory = saved.category || state.currentCategory;
            state.sessionStartedAt = saved.startedAt;
            state.sessionVolume = saved.sessionVolume || 0;
            state.sessionSets = saved.sessionSets || 0;
            state.sessionExercises = saved.sessionExercises || {};
        } catch {
            localStorage.removeItem(SESSION_KEY);
        }
    },

    // --- Screen 1: Launch ---
    renderLaunch() {
        const lastBySplit = {};
        SPLITS.forEach(s => { lastBySplit[s] = null; });
        (DB.exercises || []).forEach(ex => {
            const logs = state.logsCache[ex.id];
            if (!logs || logs.length === 0 || !(ex.category in lastBySplit)) return;
            const t = new Date(logs[0].created_at);
            if (!lastBySplit[ex.category] || t > lastBySplit[ex.category]) lastBySplit[ex.category] = t;
        });

        const sessionActive = state.sessionSets > 0;

        // Aanbevolen: split die het langst niet getraind is
        let recommended = null;
        if (!sessionActive && Object.values(lastBySplit).some(Boolean)) {
            recommended = SPLITS.reduce((best, s) => {
                if (best === null) return s;
                const a = lastBySplit[s] ? lastBySplit[s].getTime() : -Infinity;
                const b = lastBySplit[best] ? lastBySplit[best].getTime() : -Infinity;
                return a < b ? s : best;
            }, null);
        }

        SPLITS.forEach(s => {
            const meta = document.getElementById(`split-meta-${s}`);
            if (meta) meta.innerText = lastBySplit[s] ? `Laatst ${daysAgoLabel(lastBySplit[s])}` : 'Nog niet getraind';
            const btn = document.getElementById(`split-btn-${s}`);
            if (btn) {
                btn.classList.toggle('recommended', s === recommended);
                btn.classList.toggle('in-progress', sessionActive && s === state.currentCategory);
            }
        });

        const banner = document.getElementById('resume-banner');
        if (banner) {
            banner.hidden = !sessionActive;
            if (sessionActive) {
                const exCount = Object.keys(state.sessionExercises).length;
                document.getElementById('resume-text').innerText =
                    `${state.currentCategory || 'Workout'} · ${exCount} oef. · ${state.sessionSets} sets`;
            }
        }
    },

    resumeWorkout() {
        if (state.currentCategory) this.selectSplit(state.currentCategory);
    },

    // Bottom Nav - Global Progress
    async showGlobalProgress(btnElement) {
        this.navToMode('global-progress', btnElement);

        // Verberg chart panel, toon lijst
        document.getElementById('progress-chart-panel').style.display = 'none';
        document.getElementById('progress-exercise-list').style.display = 'block';

        const container = document.getElementById('progress-exercise-list');
        container.innerHTML = '<small style="color: var(--text-muted); padding: 24px; display:block; text-align:center;">Laden...</small>';

        // Zorg dat exercises altijd vers zijn (ook na page refresh)
        if (!DB.exercises || DB.exercises.length === 0) {
            DB.exercises = await DB.getExercises();
        }

        // Haal alle logs parallel op en groepeer per oefening
        await this.loadLogsFor(DB.exercises);
        const allLogs = DB.exercises
            .map(ex => ({ exercise: ex, logs: state.logsCache[ex.id] || [] }))
            .filter(item => item.logs.length > 0);

        if (allLogs.length === 0) {
            container.innerHTML = `
                <div style="padding: 48px 24px; text-align: center; color: var(--text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 16px;">📊</div>
                    <p style="font-weight: 600;">Nog geen data</p>
                    <p style="font-size: 0.9rem; margin-top: 8px;">Log je eerste set om progressie te zien!</p>
                </div>`;
            return;
        }

        // Sorteer op meest recent gelogd
        allLogs.sort((a, b) => new Date(b.logs[0].created_at) - new Date(a.logs[0].created_at));

        container.innerHTML = '';
        allLogs.forEach(({ exercise, logs }) => {
            const pr = Math.max(...logs.map(l => Number(l.weight)));
            const totalSets = logs.length;
            const lastDate = new Date(logs[0].created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
            const oneRM = Math.max(...logs.map(l => this.calculate1RM(Number(l.weight), Number(l.reps))));

            const card = document.createElement('div');
            card.className = 'progress-ex-card glass-card';
            card.innerHTML = `
                <div class="progress-ex-info">
                    <span class="progress-ex-name">${escapeHtml(exercise.name)}</span>
                    <span class="progress-ex-meta">${escapeHtml(exercise.category)} · ${totalSets} sets · laatst ${lastDate}</span>
                </div>
                <div class="progress-ex-stats">
                    <span class="progress-ex-pr">PR: ${formatKg(pr)} kg</span>
                    <span class="progress-ex-1rm">1RM: ~${formatKg(oneRM)} kg</span>
                </div>
                <ion-icon name="chevron-forward" style="color: var(--text-muted); font-size: 1.2rem;"></ion-icon>
            `;
            card.onclick = () => this.openProgressChart(exercise, logs);
            container.appendChild(card);
        });
    },

    openProgressChart(exercise, logs) {
        document.getElementById('progress-exercise-list').style.display = 'none';
        const panel = document.getElementById('progress-chart-panel');
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';

        document.getElementById('progress-chart-title').innerText = exercise.name;

        const chartData = [...logs].reverse();
        const canvas = document.getElementById('globalChart');
        const ctx = canvas.getContext('2d');
        if (state.globalChart) state.globalChart.destroy();

        state.globalChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => new Date(d.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })),
                datasets: [{
                    label: 'Gewicht (kg)',
                    data: chartData.map(d => d.weight),
                    borderColor: '#FF1A55',
                    backgroundColor: 'rgba(255, 26, 85, 0.18)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointBackgroundColor: '#FF1A55',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: state.theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' },
                        ticks: { color: state.theme === 'light' ? '#64748b' : '#888' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: state.theme === 'light' ? '#64748b' : '#888', maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 8 }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

        const best = Math.max(...chartData.map(d => Number(d.weight)));
        const totalVolume = chartData.reduce((acc, d) => acc + (d.weight * d.reps), 0);
        document.getElementById('global-summary').innerHTML = `
            <div class="summary-card glass-card" style="margin-bottom: 8px;">
                <small>ALL-TIME RECORD</small>
                <h3 style="color: var(--accent);">${formatKg(best)} kg</h3>
            </div>
            <div class="summary-card glass-card">
                <small>TOTAAL VERPLAATST VOLUME</small>
                <h3 style="color: var(--primary);">${formatKg(totalVolume)} kg</h3>
            </div>
        `;
    },

    closeProgressChart() {
        document.getElementById('progress-chart-panel').style.display = 'none';
        document.getElementById('progress-exercise-list').style.display = 'block';
        if (state.globalChart) {
            state.globalChart.destroy();
            state.globalChart = null;
        }
    },

    async renderGlobalProgress() {
        // Legacy fallback — niet meer gebruikt in nieuwe UI
    },

    // Screen 1 -> Screen 2
    async selectSplit(category) {
        state.currentCategory = category;
        document.getElementById('workout-title').innerText = `${category} Workout`;
        this.hideAddExerciseForm();
        this.renderExerciseList();
        this.navTo('workout');

        // Laatste prestaties per oefening op de achtergrond ophalen
        await this.loadLogsFor(this.exercisesForCategory(category));
        if (state.currentCategory === category) this.renderExerciseList();
    },

    showAddExerciseForm() {
        const container = document.getElementById('add-ex-container');
        if (container.style.display === 'none') {
            this.fillExerciseSuggestions();
            container.style.display = 'flex';
            document.getElementById('add-ex-btn').style.display = 'none';
            const input = document.getElementById('new-ex-input');
            input.focus();
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            this.hideAddExerciseForm();
        }
    },

    hideAddExerciseForm() {
        document.getElementById('add-ex-container').style.display = 'none';
        document.getElementById('add-ex-btn').style.display = 'flex';
        document.getElementById('new-ex-input').value = '';
    },

    fillExerciseSuggestions() {
        const existing = new Set(this.exercisesForCategory(state.currentCategory).map(ex => ex.name.toLowerCase()));
        const list = document.getElementById('ex-suggestions');
        const options = (EXERCISE_SUGGESTIONS[state.currentCategory] || [])
            .filter(name => !existing.has(name.toLowerCase()));
        list.innerHTML = options.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
    },

    async saveNewExercise() {
        const input = document.getElementById('new-ex-input');
        const name = input.value.trim();
        if (!name) return;

        const duplicate = this.exercisesForCategory(state.currentCategory)
            .some(ex => ex.name.toLowerCase() === name.toLowerCase());
        if (duplicate) {
            this.showToast('Deze oefening bestaat al');
            return;
        }

        const newExData = {
            category: state.currentCategory,
            name: name
        };

        try {
            const savedEx = await DB.saveExercise(newExData);
            if (savedEx) {
                if (!DB.exercises.some(ex => ex.id === savedEx.id)) DB.exercises.push(savedEx);
                this.hideAddExerciseForm();
                this.renderExerciseList();
                this.showToast(`${name} toegevoegd ✅`);
            }
        } catch (e) {
            this.showToast('Fout bij opslaan oefening.');
        }
    },

    exerciseMetaText(ex) {
        const done = this.sessionEntries(ex.id);
        if (done.length > 0) {
            const last = done[done.length - 1];
            return `Vandaag: ${done.length} ${done.length === 1 ? 'set' : 'sets'} · laatste ${formatKg(last.weight)} kg × ${last.reps}`;
        }
        const prev = this.getPreviousSession(ex.id);
        if (prev && prev.sets.length > 0) {
            const top = prev.sets.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
            return `${daysAgoLabel(prev.date)}: ${prev.sets.length} × ${formatKg(top.weight)} kg`;
        }
        return 'Nog niet gelogd';
    },

    renderExerciseList() {
        const container = document.getElementById('exercise-list');
        container.innerHTML = '';
        const filtered = this.exercisesForCategory(state.currentCategory);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Nog geen oefeningen voor ${escapeHtml(state.currentCategory || '')}.</p>
                    <p>Voeg er hieronder één toe.</p>
                </div>`;
        }

        filtered.forEach(ex => {
            const doneCount = this.sessionEntries(ex.id).length;

            const containerDiv = document.createElement('div');
            containerDiv.className = 'swipe-container';

            const actionDiv = document.createElement('div');
            actionDiv.className = 'swipe-action';
            actionDiv.innerHTML = '<ion-icon name="trash"></ion-icon>';

            const contentDiv = document.createElement('div');
            contentDiv.className = `swipe-content glass-card${doneCount > 0 ? ' done' : ''}`;
            contentDiv.style.border = 'none'; // handled by container
            contentDiv.innerHTML = `
                <div class="ex-info">
                    <span class="ex-name">${escapeHtml(ex.name)}</span>
                    <span class="ex-meta">${escapeHtml(this.exerciseMetaText(ex))}</span>
                </div>
                ${doneCount > 0
                    ? `<span class="ex-done-badge"><ion-icon name="checkmark"></ion-icon>${doneCount}</span>`
                    : '<ion-icon name="chevron-forward"></ion-icon>'}`;

            // Swipe logic variables
            let startX = 0;
            let startY = 0;
            let currentX = 0;
            let currentY = 0;
            let isSwiping = false;
            let hasMoved = false;
            let isVerticalScroll = false;
            let handledByTouch = false;

            contentDiv.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                currentX = startX;
                currentY = startY;
                isSwiping = true;
                hasMoved = false;
                isVerticalScroll = false;
                contentDiv.style.transition = 'none';
            }, { passive: true });

            contentDiv.addEventListener('touchmove', (e) => {
                if (!isSwiping || isVerticalScroll) return;

                currentX = e.touches[0].clientX;
                currentY = e.touches[0].clientY;

                const diffX = currentX - startX;
                const diffY = currentY - startY;

                // Detect initial direction
                if (!hasMoved) {
                    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
                        isVerticalScroll = true;
                        return;
                    }
                    if (Math.abs(diffX) > 10) {
                        hasMoved = true;
                    }
                }

                if (hasMoved && diffX < 0) {
                    // Prevent page scroll when swiping horizontally
                    if (e.cancelable) e.preventDefault();
                    contentDiv.style.transform = `translateX(${diffX}px)`;
                }
            }, { passive: false }); // Set passive false to allow preventDefault for horizontal swipes

            contentDiv.addEventListener('touchend', (e) => {
                if (!isSwiping) return;
                isSwiping = false;
                handledByTouch = true;
                setTimeout(() => { handledByTouch = false; }, 400);

                if (isVerticalScroll) {
                    contentDiv.style.transition = 'transform 0.2s ease-out';
                    contentDiv.style.transform = `translateX(0)`;
                    return;
                }

                // Use currentX from touchmove for more reliability
                const diffX = currentX - startX;
                contentDiv.style.transition = 'transform 0.2s ease-out';

                if (hasMoved && diffX < -120) {
                    // Confirmed swipe to delete (increased threshold to 120px)
                    contentDiv.style.transform = `translateX(-100%)`;
                    setTimeout(() => {
                        this.deleteExercise(ex.id);
                    }, 200);
                } else {
                    // Snap back
                    contentDiv.style.transform = `translateX(0)`;

                    // If it was a clean tap (minimal movement)
                    if (!hasMoved || (Math.abs(diffX) < 15 && !isVerticalScroll)) {
                        this.selectExercise(ex);
                    }
                }
            });

            // Desktop click fallback (touch is al afgehandeld in touchend)
            contentDiv.onclick = () => {
                if (!hasMoved && !handledByTouch) {
                    this.selectExercise(ex);
                }
            };

            containerDiv.appendChild(actionDiv);
            containerDiv.appendChild(contentDiv);
            container.appendChild(containerDiv);
        });

        this.updateWorkoutSummary();
    },

    updateWorkoutSummary() {
        const el = document.getElementById('workout-session-summary');
        if (!el) return;
        if (state.sessionSets > 0) {
            const exCount = Object.keys(state.sessionExercises).length;
            el.innerText = `${exCount} oef. · ${state.sessionSets} sets · ${formatKg(state.sessionVolume)} kg`;
            el.hidden = false;
        } else {
            el.hidden = true;
        }
    },

    async deleteExercise(id) {
        // Find index in cache
        const index = DB.exercises.findIndex(ex => ex.id === id);
        if (index > -1) {
            const ex = DB.exercises[index];
            const logCount = (state.logsCache[id] || []).length;
            const question = logCount > 0
                ? `"${ex.name}" verwijderen? Ook de ${logCount} gelogde sets worden verwijderd.`
                : `"${ex.name}" verwijderen?`;
            if (!window.confirm(question)) {
                this.renderExerciseList();
                return;
            }
            try {
                await DB.deleteExercise(id);
                DB.exercises.splice(index, 1);
                delete state.logsCache[id];
                this.renderExerciseList();
            } catch (e) {
                this.showToast('Fout bij verwijderen.');
                this.renderExerciseList();
            }
        }
    },

    // Screen 2 -> Screen 3
    async selectExercise(exercise) {
        // Prevent redundant calls if already navigating/processing or if same exercise is already active
        if (state.currentExercise && state.currentExercise.id === exercise.id && document.getElementById('screen-log').classList.contains('active')) {
            return;
        }

        state.currentExercise = exercise;
        document.getElementById('exercise-title').innerText = exercise.name;

        // Direct tonen met gecachte data, daarna verversen
        if (state.logsCache[exercise.id]) this.cacheLogs(exercise.id, state.logsCache[exercise.id]);
        this.prepareNextSet();
        this.renderLogScreen();
        this.navTo('log');

        const logs = await DB.getLogsForExercise(exercise.id);
        if (!state.currentExercise || state.currentExercise.id !== exercise.id) return;
        this.cacheLogs(exercise.id, logs);
        if (!state.dirty) this.prepareNextSet();
        this.renderLogScreen();
    },

    goToNextExercise() {
        const next = this.getNextExercise();
        if (next) this.selectExercise(next);
    },

    getNextExercise() {
        if (!state.currentExercise) return null;
        const list = this.exercisesForCategory(state.currentExercise.category);
        const idx = list.findIndex(ex => ex.id === state.currentExercise.id);
        // Eerst de volgende oefening die nog niet gedaan is, anders gewoon de volgende
        const after = list.slice(idx + 1).concat(list.slice(0, idx));
        return after.find(ex => this.sessionEntries(ex.id).length === 0) || list[idx + 1] || null;
    },

    renderLogScreen() {
        if (!state.currentExercise) return;
        const exId = state.currentExercise.id;
        const entries = this.sessionEntries(exId);
        const setNr = entries.length + 1;
        const prev = this.getPreviousSession(exId);

        document.getElementById('set-number').innerText = `Set ${setNr}`;
        document.getElementById('log-btn-label').innerText = `Log set ${setNr}`;

        const target = prev ? prev.sets[entries.length] : null;
        let hint;
        if (target) hint = `Vorige keer: ${formatKg(target.weight)} kg × ${target.reps}`;
        else if (prev) hint = `Extra set t.o.v. vorige keer 💪`;
        else hint = entries.length === 0 ? 'Eerste keer — kies een startgewicht' : '';
        document.getElementById('set-hint').innerText = hint;

        // Vandaag gelogde sets
        const todaySection = document.getElementById('today-section');
        todaySection.hidden = entries.length === 0;
        document.getElementById('today-sets').innerHTML = entries.map((e, i) => `
            <div class="set-chip done">
                <span class="set-chip-idx">${i + 1}</span>
                <span>${formatKg(e.weight)} kg × ${e.reps}</span>
                <button class="set-chip-del" onclick="app.deleteSessionSet(${i})" aria-label="Set ${i + 1} verwijderen">
                    <ion-icon name="close"></ion-icon>
                </button>
            </div>`).join('');

        // Vorige training — tik om over te nemen
        const prevSection = document.getElementById('prev-section');
        prevSection.hidden = !prev;
        if (prev) {
            document.getElementById('prev-title').innerText = `Vorige keer · ${daysAgoLabel(prev.date)}`;
            document.getElementById('prev-sets').innerHTML = prev.sets.map((s, i) => `
                <button class="set-chip prev${i === entries.length ? ' target' : ''}" onclick="app.applyPrevSet(${i})">
                    <span class="set-chip-idx">${i + 1}</span>
                    <span>${formatKg(s.weight)} kg × ${s.reps}</span>
                </button>`).join('');
        }

        // Volgende oefening
        const next = this.getNextExercise();
        const nextBtn = document.getElementById('next-ex-btn');
        nextBtn.hidden = !next;
        if (next) document.getElementById('next-ex-name').innerText = next.name;

        this.updateCounters();
        this.updateVolumeBadge();
    },

    applyPrevSet(index) {
        const prev = this.getPreviousSession(state.currentExercise.id);
        if (!prev || !prev.sets[index]) return;
        state.weight = Number(prev.sets[index].weight);
        state.reps = Number(prev.sets[index].reps);
        state.dirty = true;
        this.vibrate(20);
        this.updateCounters();
    },

    // --- Helpers ---
    vibrate(pattern = 40) {
        if (navigator.vibrate) navigator.vibrate(pattern);
    },

    calculate1RM(weight, reps) {
        if (reps === 1) return weight;
        if (reps <= 0 || weight <= 0) return 0;
        // Epley formula: 1RM = weight * (1 + reps / 30)
        return Math.round(weight * (1 + reps / 30));
    },

    triggerConfetti(origin = { x: 0.5, y: 0.6 }) {
        if (typeof confetti !== 'function') return;
        confetti({
            particleCount: 120,
            spread: 80,
            origin,
            colors: ['#FF1A55', '#ffffff', '#E6003D', '#ffd700'],
            zIndex: 9999
        });
    },

    updateVolumeBadge() {
        const se = state.currentExercise ? state.sessionExercises[state.currentExercise.id] : null;
        state.exerciseVolume = se ? se.volume : 0;
        state.exerciseSets = se ? se.sets : 0;

        // Per oefening
        const exVol = document.getElementById('exercise-volume-badge');
        if (exVol) {
            exVol.innerText = `${state.exerciseSets} sets · ${formatKg(state.exerciseVolume)} kg`;
        }
        // Totaal sessie
        const sesVol = document.getElementById('session-volume-badge');
        if (sesVol) {
            sesVol.innerText = `Sessie: ${state.sessionSets} sets · ${formatKg(state.sessionVolume)} kg`;
        }
    },

    updateWeight(delta) {
        const newVal = Math.round((state.weight + delta) * 100) / 100;
        if (newVal >= 0 && newVal <= MAX_WEIGHT) {
            state.weight = newVal;
            state.dirty = true;
            this.vibrate(20);
            this.updateCounters();
        }
    },

    updateReps(delta) {
        const newVal = state.reps + delta;
        if (newVal >= 0 && newVal <= MAX_REPS) {
            state.reps = newVal;
            state.dirty = true;
            this.vibrate(20);
            this.updateCounters();
        }
    },

    // Direct typen in het gewicht/reps-veld
    onWeightInput(el) {
        const v = parseFloat(el.value.replace(',', '.'));
        if (!isNaN(v) && v >= 0 && v <= MAX_WEIGHT) {
            state.weight = Math.round(v * 100) / 100;
            state.dirty = true;
            this.updateOneRM();
        }
    },

    onRepsInput(el) {
        const v = parseInt(el.value, 10);
        if (!isNaN(v) && v >= 0 && v <= MAX_REPS) {
            state.reps = v;
            state.dirty = true;
            this.updateOneRM();
        }
    },

    updateCounters() {
        document.getElementById('current-weight').value = formatInputNumber(state.weight);
        document.getElementById('current-reps').value = state.reps;
        this.updateOneRM();
    },

    updateOneRM() {
        // Live 1RM
        const oneRM = this.calculate1RM(state.weight, state.reps);
        const el = document.getElementById('one-rm-display');
        if (el) el.innerText = oneRM > 0 ? `Geschat 1RM: ${formatKg(oneRM)} kg` : '';
    },

    useLastWeight() {
        if (state.lastLog) {
            state.weight = Number(state.lastLog.weight);
            this.updateCounters();
        }
    },

    useLastReps() {
        if (state.lastLog) {
            state.reps = Number(state.lastLog.reps);
            this.updateCounters();
        }
    },

    async submitLog() {
        if (state.saving || !state.currentExercise) return;

        // Waarden uit een nog gefocust invoerveld meenemen
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

        const exId = state.currentExercise.id;
        const exName = state.currentExercise.name;
        const weight = state.weight;
        const reps = state.reps;
        const volume = weight * reps;

        if (reps <= 0) {
            this.showToast('Vul minstens 1 rep in');
            return;
        }

        const btn = document.getElementById('log-btn');
        state.saving = true;
        btn.disabled = true;

        try {
            await DB.saveLog({ exerciseId: exId, weight, reps });
        } catch (e) {
            this.showToast('Opslaan mislukt — check je verbinding');
            state.saving = false;
            btn.disabled = false;
            return;
        }

        // --- PR detectie (vergeleken met de PR van vóór deze set) ---
        const prevPR = state.allTimePRs[exId] || 0;
        const isPR = weight > prevPR && reps > 0 && weight > 0;
        if (isPR) state.allTimePRs[exId] = weight;

        // --- Haptic ---
        this.vibrate(isPR ? [60, 40, 60] : 80);

        // --- Volume bijhouden ---
        if (!state.sessionStartedAt) state.sessionStartedAt = Date.now();
        state.sessionVolume += volume;
        state.sessionSets += 1;

        // Per-oefening opslaan in sessionExercises
        if (!state.sessionExercises[exId]) {
            state.sessionExercises[exId] = { name: exName, volume: 0, sets: 0, entries: [] };
        }
        const se = state.sessionExercises[exId];
        if (!se.entries) se.entries = [];
        se.volume += volume;
        se.sets += 1;
        const entry = { id: null, weight, reps };
        se.entries.push(entry);

        // --- PR toast of normale toast ---
        if (isPR) {
            this.showToast('🏆 Personal Record! ' + formatKg(weight) + ' kg', true);
            this.triggerConfetti();
        } else {
            this.showToast('Set Opgeslagen 🚀');
        }

        this.startRestTimer(state.restDefault);

        // Feedback cycle: logs verversen zodat we de id van deze set kennen
        try {
            const logs = await DB.getLogsForExercise(exId);
            const knownIds = new Set(se.entries.map(e => e.id).filter(Boolean));
            const match = logs.find(l => !knownIds.has(l.id) && Number(l.weight) === weight && Number(l.reps) === reps);
            if (match) entry.id = match.id;
            const pr = state.allTimePRs[exId];
            this.cacheLogs(exId, logs);
            if (pr && (!state.allTimePRs[exId] || pr > state.allTimePRs[exId])) state.allTimePRs[exId] = pr;
        } catch (e) {
            console.warn('Kon logs niet verversen:', e);
        }

        this.persistSession();
        if (state.currentExercise && state.currentExercise.id === exId) {
            this.prepareNextSet();
            this.renderLogScreen();
        }

        state.saving = false;
        btn.disabled = false;
    },

    async deleteSessionSet(index) {
        if (!state.currentExercise || state.saving) return;
        const exId = state.currentExercise.id;
        const se = state.sessionExercises[exId];
        if (!se || !se.entries || !se.entries[index]) return;
        const entry = se.entries[index];

        state.saving = true;
        try {
            if (!entry.id) {
                // id onbekend (verversen mislukte) — zoek de bijbehorende log op
                const logs = await DB.getLogsForExercise(exId);
                const knownIds = new Set(se.entries.map(e => e.id).filter(Boolean));
                const match = logs.find(l => !knownIds.has(l.id) && Number(l.weight) === entry.weight && Number(l.reps) === entry.reps);
                if (!match) throw new Error('Log niet gevonden');
                entry.id = match.id;
            }
            await DB.deleteLog(entry.id);
        } catch (e) {
            this.showToast('Fout bij verwijderen.');
            state.saving = false;
            return;
        }

        const volume = entry.weight * entry.reps;
        se.entries.splice(index, 1);
        se.volume -= volume;
        se.sets -= 1;
        state.sessionVolume -= volume;
        state.sessionSets -= 1;
        if (se.sets <= 0) delete state.sessionExercises[exId];
        if (state.sessionSets <= 0) state.sessionStartedAt = null;

        const logs = await DB.getLogsForExercise(exId);
        this.cacheLogs(exId, logs);

        this.persistSession();
        this.prepareNextSet();
        this.renderLogScreen();
        this.vibrate(30);
        this.showToast('Set verwijderd 🗑️');
        state.saving = false;
    },

    // Verwijdert de laatst gelogde set van deze sessie voor de huidige oefening
    async undoLastLog() {
        if (!state.currentExercise) return;
        const entries = this.sessionEntries(state.currentExercise.id);
        if (entries.length > 0) await this.deleteSessionSet(entries.length - 1);
    },

    startRestTimer(seconds = 180) {
        this.dismissRestTimer(false);

        state.restSecondsLeft = seconds;
        const el = document.getElementById('rest-timer');
        const timeEl = document.getElementById('rest-timer-time');
        if (!el || !timeEl) return;

        el.hidden = false;
        el.classList.remove('done');
        const labelEl = el.querySelector('.rest-timer-label');
        if (labelEl) labelEl.innerText = 'Rust';
        timeEl.innerText = this.formatRestTime(state.restSecondsLeft);

        state.restTimerId = setInterval(() => {
            state.restSecondsLeft -= 1;
            if (state.restSecondsLeft <= 0) {
                timeEl.innerText = '0:00';
                el.classList.add('done');
                if (labelEl) labelEl.innerText = 'Klaar';
                clearInterval(state.restTimerId);
                state.restTimerId = null;
                this.vibrate([200, 100, 200]);
                this.showToast('Klaar voor de volgende set 💪');
                setTimeout(() => this.dismissRestTimer(), 2500);
                return;
            }
            timeEl.innerText = this.formatRestTime(state.restSecondsLeft);
        }, 1000);
    },

    // +/- 30 seconden; de nieuwe duur wordt onthouden als standaard
    adjustRestTimer(delta) {
        if (!state.restTimerId) return;
        state.restSecondsLeft = Math.max(5, state.restSecondsLeft + delta);
        state.restDefault = Math.min(600, Math.max(30, state.restDefault + delta));
        localStorage.setItem(REST_KEY, String(state.restDefault));
        document.getElementById('rest-timer-time').innerText = this.formatRestTime(state.restSecondsLeft);
        this.vibrate(20);
    },

    formatRestTime(totalSeconds) {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },

    dismissRestTimer(hide = true) {
        if (state.restTimerId) {
            clearInterval(state.restTimerId);
            state.restTimerId = null;
        }
        state.restSecondsLeft = 0;
        if (hide) {
            const el = document.getElementById('rest-timer');
            if (el) {
                el.hidden = true;
                el.classList.remove('done');
            }
        }
    },

    showToast(msg = 'Set Opgeslagen 🚀', isPR = false) {
        const toast = document.getElementById('toast');
        document.getElementById('toast-msg').innerText = msg;
        toast.classList.toggle('toast-pr', isPR);
        toast.classList.add('show');
        clearTimeout(state.toastTimeout);
        state.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.remove('toast-pr');
        }, isPR ? 2500 : 1500);
    },

    // Screen 3 -> Screen 4 (Stats)
    async showStats() {
        document.getElementById('stats-title').innerText = `${state.currentExercise.name} Progress`;
        this.navTo('stats');

        const logs = await DB.getLogsForExercise(state.currentExercise.id);
        // Sort Chrome's way: ASC for chart
        const chartData = [...logs].reverse();

        this.renderChart(chartData);
    },

    renderChart(data) {
        const ctx = document.getElementById('progressChart').getContext('2d');

        if (state.chart) {
            state.chart.destroy();
        }

        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => new Date(d.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })),
                datasets: [{
                    label: 'Gewicht (kg)',
                    data: data.map(d => d.weight),
                    borderColor: '#FF1A55',
                    backgroundColor: 'rgba(255, 26, 85, 0.12)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointBackgroundColor: '#FF1A55'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: state.theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: state.theme === 'light' ? '#64748b' : '#888' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: state.theme === 'light' ? '#64748b' : '#888', autoSkip: true, maxTicksLimit: 8 }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Summary
        const best = data.length > 0 ? Math.max(...data.map(d => Number(d.weight))) : 0;
        const best1RM = data.length > 0 ? Math.max(...data.map(d => this.calculate1RM(Number(d.weight), Number(d.reps)))) : 0;
        document.getElementById('stats-summary').innerHTML = `
            <div class="summary-card glass-card">
                <small>PERSOONLIJK RECORD</small>
                <h3>${formatKg(best)} kg</h3>
            </div>
            <div class="summary-card glass-card">
                <small>BESTE GESCHATTE 1RM</small>
                <h3 style="color: var(--primary);">${formatKg(best1RM)} kg</h3>
            </div>
        `;
    },

    finishWorkout() {
        // Bouw samenvatting op
        const exercises = Object.values(state.sessionExercises);
        const totalVolume = state.sessionVolume;
        const totalSets = state.sessionSets;

        let exerciseRows = '';
        if (exercises.length === 0) {
            exerciseRows = '<p style="color: var(--text-muted); text-align:center;">Geen sets gelogd deze sessie.</p>';
        } else {
            exerciseRows = exercises.map(ex => `
                <div class="finish-exercise-row">
                    <span class="finish-ex-name">${escapeHtml(ex.name)}</span>
                    <span class="finish-ex-stats">${ex.sets} sets · ${formatKg(ex.volume)} kg</span>
                </div>
            `).join('');
        }

        const minutes = state.sessionStartedAt ? Math.max(1, Math.round((Date.now() - state.sessionStartedAt) / 60000)) : 0;

        document.getElementById('finish-total-volume').innerText = formatKg(totalVolume) + ' kg';
        document.getElementById('finish-total-sets').innerText = totalSets;
        document.getElementById('finish-duration').innerText = minutes > 0 ? `${minutes} min` : '–';
        document.getElementById('finish-exercise-list').innerHTML = exerciseRows;

        this.dismissRestTimer();
        this.navTo('finish');

        // Confetti na korte delay zodat scherm eerst rendert
        if (totalSets > 0) {
            setTimeout(() => this.triggerConfetti({ x: 0.5, y: 0.4 }), 300);
        }
    },

    resetSession() {
        state.sessionVolume = 0;
        state.sessionSets = 0;
        state.sessionExercises = {};
        state.sessionStartedAt = null;
        state.exerciseVolume = 0;
        state.exerciseSets = 0;
        state.currentExercise = null;
        this.persistSession();
        this.updateVolumeBadge();
        this.navToMode('launch', document.getElementById('nav-workout-btn'));
    },

    bindKeyboardShortcuts() {
        const onEnter = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); fn(); }
            });
        };
        ['name-input', 'email-input', 'password-input'].forEach(id => onEnter(id, () => this.handleAuth()));
        onEnter('forgot-email-input', () => this.sendPasswordReset());
        ['reset-password-input', 'reset-password-confirm'].forEach(id => onEnter(id, () => this.submitNewPassword()));
        onEnter('new-ex-input', () => this.saveNewExercise());
        onEnter('current-weight', () => document.activeElement.blur());
        onEnter('current-reps', () => document.activeElement.blur());
    }
};

window.onload = () => {
    app.bindKeyboardShortcuts();
    app.start();
};
