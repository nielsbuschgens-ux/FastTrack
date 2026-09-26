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
    restSecondsLeft: 0
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
        subtitle.style.color = '#00ffa3';
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
        
        // Rerender charts if they are visible to update grid lines
        if (state.globalChart) {
            this.renderGlobalProgress();
        }
        if (state.chart) {
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

    async manualSyncExercises() {
        const btn = event.currentTarget;
        const icon = btn.querySelector('ion-icon');
        icon.classList.add('syncing-anim'); // Add CSS for this or just rotate
        
        try {
            DB.exercises = await DB.getExercises();
            this.renderExerciseList();
            this.showToast('Lijst Ververst! 🔄');
        } finally {
            setTimeout(() => icon.classList.remove('syncing-anim'), 500);
        }
    },

    async manualSyncLogs() {
        if (!state.currentExercise) return;
        const logs = await DB.getLogsForExercise(state.currentExercise.id);
        state.lastLog = logs.length > 0 ? logs[0] : null;
        
        if (document.getElementById('screen-log').classList.contains('active')) {
            if (state.lastLog) {
                document.getElementById('use-last-bar').style.display = 'flex';
                document.getElementById('last-weight-val').innerText = state.lastLog.weight;
                document.getElementById('last-reps-val').innerText = state.lastLog.reps;
            } else {
                document.getElementById('use-last-bar').style.display = 'none';
            }
        }
        if (document.getElementById('screen-stats').classList.contains('active')) {
            this.showStats(); 
        }
    },

    // Bottom Nav - Global Progress 
    async showGlobalProgress(btnElement) {
        this.navToMode('global-progress', btnElement);

        const select = document.getElementById('global-ex-select');
        let options = '<option value="" disabled selected>Kies een oefening om te analyseren...</option>';
        DB.exercises.forEach(ex => {
            options += `<option value="${ex.id}">${ex.name} (${ex.category})</option>`;
        });
        select.innerHTML = options;

        document.getElementById('global-summary').innerHTML = '';
        if (state.globalChart) state.globalChart.destroy();
    },

    async renderGlobalProgress() {
        const select = document.getElementById('global-ex-select');
        const exerciseId = select.value;
        if (!exerciseId) return;

        // Reset summary while loading
        document.getElementById('global-summary').innerHTML = '<small>Data laden...</small>';

        const logs = await DB.getLogsForExercise(exerciseId);
        const chartData = [...logs].reverse();

        const canvas = document.getElementById('globalChart');
        if (!canvas) return; 
        const ctx = canvas.getContext('2d');
        if (state.globalChart) state.globalChart.destroy();

        state.globalChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => new Date(d.created_at).toLocaleDateString()),
                datasets: [{
                    label: 'Gewicht (kg)',
                    data: chartData.map(d => d.weight),
                    borderColor: '#00ffa3', // green line
                    backgroundColor: 'rgba(0, 255, 163, 0.15)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointBackgroundColor: '#00ffa3',
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
                        grid: { color: state.theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: state.theme === 'light' ? '#64748b' : '#888' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { 
                            color: state.theme === 'light' ? '#64748b' : '#888', 
                            maxRotation: 45, 
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 8
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Summary info
        const best = chartData.length > 0 ? Math.max(...chartData.map(d => d.weight)) : 0;
        const totalVolume = chartData.reduce((acc, current) => acc + (current.weight * current.reps), 0);

        document.getElementById('global-summary').innerHTML = '';
        if (chartData.length > 0) {
            document.getElementById('global-summary').innerHTML = `
                <div class="summary-card glass-card" style="margin-bottom: 8px;">
                    <small>ALL-TIME RECORD</small>
                    <h3 style="color: var(--accent);">${best} kg</h3>
                </div>
                <div class="summary-card glass-card">
                    <small>TOTAAL VERPLAATST VOLUME</small>
                    <h3 style="color: var(--primary);">${totalVolume} kg</h3>
                </div>
            `;
        } else {
            document.getElementById('global-summary').innerHTML = '<small>Geen data gevonden voor deze oefening.</small>';
        }
    },

    // Screen 1 -> Screen 2
    selectSplit(category) {
        state.currentCategory = category;
        document.getElementById('workout-title').innerText = `${category} Workout`;
        document.getElementById('add-ex-container').style.display = 'none'; // reset form display
        this.renderExerciseList();
        this.navTo('workout');
    },

    showAddExerciseForm() {
        const container = document.getElementById('add-ex-container');
        if (container.style.display === 'none') {
            container.style.display = 'block';
            document.getElementById('new-ex-input').focus();
        } else {
            container.style.display = 'none';
        }
    },

    async saveNewExercise() {
        const input = document.getElementById('new-ex-input');
        const name = input.value.trim();
        if (!name) return;

        const newExData = {
            category: state.currentCategory,
            name: name
        };

        try {
            const savedEx = await DB.saveExercise(newExData);
            if (savedEx) {
                DB.exercises.push(savedEx);
                input.value = '';
                this.showAddExerciseForm(); // hide
                this.renderExerciseList(); // re-render list
            }
        } catch (e) {
            this.showToast('Fout bij opslaan oefening.');
        }
    },

    renderExerciseList() {
        const container = document.getElementById('exercise-list');
        container.innerHTML = '';
        const filtered = DB.exercises.filter(ex => ex.category === state.currentCategory);

        filtered.forEach(ex => {
            const containerDiv = document.createElement('div');
            containerDiv.className = 'swipe-container';

            const actionDiv = document.createElement('div');
            actionDiv.className = 'swipe-action';
            actionDiv.innerHTML = '<ion-icon name="trash"></ion-icon>';

            const contentDiv = document.createElement('div');
            contentDiv.className = 'swipe-content glass-card';
            contentDiv.style.border = 'none'; // handled by container
            contentDiv.innerHTML = `<span>${ex.name}</span> <ion-icon name="chevron-forward"></ion-icon>`;
            
            // Swipe logic variables
            let startX = 0;
            let startY = 0;
            let currentX = 0;
            let currentY = 0;
            let isSwiping = false;
            let hasMoved = false;
            let isVerticalScroll = false;

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

            // Desktop click fallback (only if not a touch device)
            contentDiv.onclick = (e) => {
                if (!hasMoved) {
                    this.selectExercise(ex);
                }
            };

            containerDiv.appendChild(actionDiv);
            containerDiv.appendChild(contentDiv);
            container.appendChild(containerDiv);
        });
    },

    async deleteExercise(id) {
        // Find index in cache
        const index = DB.exercises.findIndex(ex => ex.id === id);
        if (index > -1) {
            try {
                await DB.deleteExercise(id);
                DB.exercises.splice(index, 1);
                this.renderExerciseList();
            } catch (e) {
                this.showToast('Fout bij verwijderen.');
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

        // Fetch last log for suggestion
        const logs = await DB.getLogsForExercise(exercise.id);
        state.lastLog = logs.length > 0 ? logs[0] : null;

        if (state.lastLog) {
            state.weight = state.lastLog.weight;
            state.reps = state.lastLog.reps;
            document.getElementById('use-last-bar').style.display = 'flex';
            document.getElementById('last-weight-val').innerText = state.lastLog.weight;
            document.getElementById('last-reps-val').innerText = state.lastLog.reps;
        } else {
            state.weight = 20; // default start
            state.reps = 10;
            document.getElementById('use-last-bar').style.display = 'none';
        }

        this.updateCounters();
        this.navTo('log');
    },

    updateWeight(delta) {
        const newVal = Math.round((state.weight + delta) * 10) / 10;
        if (newVal >= 0 && newVal <= 300) {
            state.weight = newVal;
            this.updateCounters();
        }
    },

    updateReps(delta) {
        const newVal = state.reps + delta;
        if (newVal >= 0 && newVal <= 50) {
            state.reps = newVal;
            this.updateCounters();
        }
    },

    updateCounters() {
        document.getElementById('current-weight').innerText = state.weight;
        document.getElementById('current-reps').innerText = state.reps;
    },

    useLastWeight() {
        if (state.lastLog) {
            state.weight = state.lastLog.weight;
            this.updateCounters();
        }
    },

    useLastReps() {
        if (state.lastLog) {
            state.reps = state.lastLog.reps;
            this.updateCounters();
        }
    },

    async submitLog() {
        await DB.saveLog({
            exerciseId: state.currentExercise.id,
            weight: state.weight,
            reps: state.reps
        });

        this.showToast('Set Opgeslagen 🚀');
        this.startRestTimer(180);
        // Feedback cycle: update lastLog context
        const logs = await DB.getLogsForExercise(state.currentExercise.id);
        state.lastLog = logs[0];
        document.getElementById('use-last-bar').style.display = 'flex';
        document.getElementById('last-weight-val').innerText = state.lastLog.weight;
        document.getElementById('last-reps-val').innerText = state.lastLog.reps;
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
                this.showToast('Klaar voor de volgende set 💪');
                setTimeout(() => this.dismissRestTimer(), 2500);
                return;
            }
            timeEl.innerText = this.formatRestTime(state.restSecondsLeft);
        }, 1000);
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

    async undoLastLog() {
        if (!state.lastLog) return;
        
        const btn = document.getElementById('undo-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Even geduld... <ion-icon name="hourglass-outline"></ion-icon>';
        btn.disabled = true;

        try {
            await DB.deleteLog(state.lastLog.id);
            
            // Refresh lastLog state
            const logs = await DB.getLogsForExercise(state.currentExercise.id);
            state.lastLog = logs.length > 0 ? logs[0] : null;
            
            if (state.lastLog) {
                document.getElementById('last-weight-val').innerText = state.lastLog.weight;
                document.getElementById('last-reps-val').innerText = state.lastLog.reps;
            } else {
                document.getElementById('use-last-bar').style.display = 'none';
            }
            
            this.showToast('Laatste set verwijderd! 🗑️');
        } catch (e) {
            this.showToast('Fout bij verwijderen.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    showToast(msg = 'Set Opgeslagen 🚀') {
        const toast = document.getElementById('toast');
        document.getElementById('toast-msg').innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1500);
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
                labels: data.map(d => new Date(d.created_at).toLocaleDateString()),
                datasets: [{
                    label: 'Gewicht (kg)',
                    data: data.map(d => d.weight),
                    borderColor: '#00ffa3',
                    backgroundColor: 'rgba(0, 255, 163, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointBackgroundColor: '#00ffa3'
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
                        ticks: { color: state.theme === 'light' ? '#64748b' : '#888' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Summary
        const best = data.length > 0 ? Math.max(...data.map(d => d.weight)) : 0;
        document.getElementById('stats-summary').innerHTML = `
            <div class="summary-card glass-card">
                <small>PERSOONLIJK RECORD</small>
                <h3>${best} kg</h3>
            </div>
        `;
    }
};

window.onload = () => app.start();
