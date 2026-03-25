/**
 * ANTIGRAVITY FITNESS TRACKER - SENIOR ARCHITECT VERSION
 * Stack: Vanilla JS, IndexedDB, Chart.js
 */

// --- 1. Internal Database & Supabase ---
// Retrieve from git-ignored config.js or environment variables at build time
const supabaseUrl = (window.APP_CONFIG ? window.APP_CONFIG.SUPABASE_URL : '') || '';
const supabaseKey = (window.APP_CONFIG ? window.APP_CONFIG.SUPABASE_KEY : '') || '';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: window.localStorage
    }
});

const DB = {
    exercises: [],

    async saveLog(log) {
        // Authenticated user ID is populated by Supabase automatically (via JWT)
        // Ensure user is signed in
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
            .from('fitness_logs')
            .insert({
                user_id: session.user.id,
                exercise_id: log.exerciseId,
                weight: parseFloat(log.weight),
                reps: parseInt(log.reps)
            });

        if (error) {
            console.error("Save Error:", error);
            throw error;
        }
    },

    async getLogsForExercise(exerciseId) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return [];

        const { data, error } = await supabaseClient
            .from('fitness_logs')
            .select('*')
            .eq('exercise_id', exerciseId)
            .order('created_at', { ascending: false }); // Sort by created_at DESC

        if (error) {
            console.error("Fetch Error:", error);
            return [];
        }
        return data; // returns array of {id, exercise_id, weight, reps, date}
    },

    async deleteLog(logId) {
        const { data: { session } } = await supabaseClient.auth.getSession();
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
        const { data: { session } } = await supabaseClient.auth.getSession();
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
        const { data: { session } } = await supabaseClient.auth.getSession();
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
        const { data: { session } } = await supabaseClient.auth.getSession();
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
    theme: localStorage.getItem('fasttrack_theme') || 'dark',
    exercisesChannel: null,
    logsChannel: null
};

// --- 3. UI Logic ---
const app = {
    async start() {
        console.log("Application started.");
        
        if (!supabaseUrl || !supabaseKey) {
            console.error("Supabase configuration missing!");
            this.showAuthError("Configuratie error: SUPABASE_URL of KEY ontbreekt.");
            return;
        }

        // Apply theme on load
        if (state.theme === 'light') {
            document.documentElement.classList.add('light-theme');
        }

        // Check if there is an active session on load
        try {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            if (session && session.user) {
                this.handleSuccessfulAuth(session.user);
            }
        } catch (e) {
            console.warn("Session check failed, likely not logged in:", e.message);
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
        console.log("Logged in successfully as", user.email);
        
        // Unsubscribe from any previous channel (if any)
        if (state.exercisesChannel) {
            state.exercisesChannel.unsubscribe();
            state.exercisesChannel = null;
        }

        // Try to get name from metadata, fallback to email prefix
        const displayName = (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0];
        document.getElementById('display-username').innerText = displayName;
        
        // Real-time Exercise Sync Subscription
        state.exercisesChannel = supabaseClient
            .channel('public:fitness_exercises')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fitness_exercises' }, async () => {
                console.log("Exercises updated in Supabase, refreshing...");
                DB.exercises = await DB.getExercises();
                // If we are currently on a screen that shows exercises, re-render
                if (document.getElementById('screen-workout').classList.contains('active')) {
                    this.renderExerciseList();
                }
            })
            .subscribe((status) => {
                console.log("Exercises sub status:", status);
                this.updateSyncIndicator(status === 'SUBSCRIBED');
            });

        // Real-time Logs Sync Subscription
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

        // Fetch exercises from Supabase
        const customExercises = await DB.getExercises();

        // If user has NO exercises, we can bootstrap them with defaults OR just leave it empty.
        if (customExercises.length === 0) {
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
            
            // Insert defaults into Supabase for this user
            // Use Promise.all to be faster
            await Promise.all(defaultNames.map(item => DB.saveExercise(item)));
            
            // Refetch after inserting defaults (the subscription might fire too, but we do it manually for speed)
            DB.exercises = await DB.getExercises();
        } else {
            DB.exercises = customExercises;
        }

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
        await supabaseClient.auth.signOut();
        this.navTo('login');
    },

    navTo(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${screenId}`).classList.add('active');

        // Setup Bottom Nav visibility Context
        const nav = document.querySelector('.bottom-nav');
        if (screenId === 'launch' || screenId === 'global-progress') {
            nav.style.display = 'flex';
        } else {
            // Hide bottom nav when deep inside workout flows
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
        document.getElementById('global-summary').innerHTML = '<small>Ophalen uit Supabase...</small>';

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
        const newVal = state.weight + delta;
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
        // Feedback cycle: update lastLog context
        const logs = await DB.getLogsForExercise(state.currentExercise.id);
        state.lastLog = logs[0];
        document.getElementById('use-last-bar').style.display = 'flex';
        document.getElementById('last-weight-val').innerText = state.lastLog.weight;
        document.getElementById('last-reps-val').innerText = state.lastLog.reps;
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
