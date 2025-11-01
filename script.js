// --- CONFIGURACIÓN ---
const AppConfig = {
    API_URL: 'https://script.google.com/macros/s/AKfycbzFNGHqiOlKDq5AAGhuDEDweEGgqNoJZFsGrkD3r4aGetrMYLOJtieNK1tVz9iqjvHHNg/exec',
    CLAVE_MAESTRA: 'PinceladasM25-26',
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1GArB7I19uGum6awiRN6qK8HtmTWGcaPGWhOzGCdhbcs/edit',
    ALERT_THRESHOLD: 1800000,
    MIN_CHANGES_FOR_ALERT: 5,
    MAX_ALERT_DURATION: 30000,
    RAPID_CHANGE_THRESHOLD: 300000,
    RAPID_CHANGE_COUNT: 3,
    CHANGE_NOTIFICATION_DURATION: 8000,
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    MAX_RETRIES: 5,
    CACHE_DURATION: 300000,
};

// --- ESTADO DE LA APLICACIÓN ---
const AppState = {
    datosActuales: null,
    historialUsuarios: {},
    cambiosPersistentes: {},
    cambiosRapidos: {},
    actualizacionEnProceso: false,
    retryCount: 0,
    retryDelay: AppConfig.INITIAL_RETRY_DELAY,
    cachedData: null,
    lastCacheTime: null,
    isOffline: false,
    notificationCounter: 0,
};

// --- AUTENTICACIÓN ---
const AppAuth = {
    verificarClave: function() {
        const claveInput = document.getElementById('clave-input');
        if (claveInput.value === AppConfig.CLAVE_MAESTRA) {
            window.open(AppConfig.SPREADSHEET_URL, '_blank');
            document.getElementById('gestion-modal').classList.remove('active');
            claveInput.value = '';
            claveInput.style.borderColor = '';
        } else { 
            claveInput.style.borderColor = 'red';
            claveInput.style.animation = 'shake 0.5s';
            setTimeout(() => {
                claveInput.style.animation = '';
            }, 500);
         }
    }
};

// --- MANEJO DE LA INTERFAZ (UI) ---
const AppUI = {
    /**
     * Actualiza el estado de la conexión (actualmente solo log en consola).
     */
    updateConnectionStatus: function(status, message = '', isOffline = false) {
        console.log('Estado del sistema:', status, message);
    },

    /**
     * Obtiene el HTML del indicador de ranking.
     */
    getRankIndicator: function(posicion, isNegative = false) {
        if (isNegative) return `<div class="rank-indicator rank-negative">-</div>`;
        return `<div class="rank-indicator rank-${posicion}">${posicion}</div>`;
    },

    /**
     * Crea un elemento HTML para un usuario.
     */
    crearUsuarioItem: function(usuario, uIndex, grupo, posGrupo) {
        const usuarioItem = document.createElement('div');
        const isCiclaSpecial = grupo.nombre === "Cicla" && usuario.pinceles < -5000;
        usuarioItem.className = `usuario-item${isCiclaSpecial ? ' cicla-special-condition' : ''}`;
        usuarioItem.dataset.userName = usuario.nombre; 
        usuarioItem.style.order = uIndex;

        const trendingIcon = usuario.trending ? `<span class="trending-icon" title="En racha">🔥</span>` : '';
        const isCiclaHighlight = grupo.nombre === "Cicla" && usuario.pinceles > 5000;
        const pincelesClasses = `pinceles-count${usuario.pinceles < 0 ? ' negative' : ''}${isCiclaHighlight ? ' cicla-highlight' : ''}`;
        
        usuarioItem.innerHTML = `
            ${AppUI.getRankIndicator(uIndex + 1, usuario.pinceles < 0)}
            <span class="usuario-nombre" data-usuario='${JSON.stringify(usuario)}' data-grupo='${JSON.stringify(grupo)}' data-posicion-grupo='${posGrupo}' data-posicion-individual='${uIndex + 1}'>
                ${usuario.nombre}${trendingIcon}
            </span>
            <span class="${pincelesClasses}">${AppData.formatNumber(usuario.pinceles)}</span>`;
        
        return usuarioItem;
    },

    /**
     * Actualiza un elemento HTML de usuario existente.
     */
    actualizarUsuarioItem: function(usuarioItem, usuario, uIndex, grupo, posGrupo) {
        usuarioItem.style.order = uIndex;
        
        const isCiclaSpecial = grupo.nombre === "Cicla" && usuario.pinceles < -5000;
        usuarioItem.classList.toggle('cicla-special-condition', isCiclaSpecial);

        const trendingIcon = usuario.trending ? `<span class="trending-icon" title="En racha">🔥</span>` : '';
        const isCiclaHighlight = grupo.nombre === "Cicla" && usuario.pinceles > 5000;
        const pincelesClasses = `pinceles-count${usuario.pinceles < 0 ? ' negative' : ''}${isCiclaHighlight ? ' cicla-highlight' : ''}`;

        const rankIndicator = usuarioItem.querySelector('.rank-indicator');
        if (rankIndicator) {
            rankIndicator.outerHTML = AppUI.getRankIndicator(uIndex + 1, usuario.pinceles < 0);
        }

        const nombreSpan = usuarioItem.querySelector('.usuario-nombre');
        if (nombreSpan) {
            nombreSpan.innerHTML = `${usuario.nombre}${trendingIcon}`;
            nombreSpan.dataset.usuario = JSON.stringify(usuario);
            nombreSpan.dataset.grupo = JSON.stringify(grupo);
            nombreSpan.dataset.posicionGrupo = posGrupo;
            nombreSpan.dataset.posicionIndividual = uIndex + 1;
        }

        const pincelesSpan = usuarioItem.querySelector('.pinceles-count');
        if (pincelesSpan) {
            pincelesSpan.className = pincelesClasses;
            pincelesSpan.textContent = AppData.formatNumber(usuario.pinceles);
        }
    },

    /**
     * Reconcilia la lista de usuarios dentro de un grupo.
     */
    actualizarUsuariosLista: function(usuariosListaEl, usuariosNuevos, grupo, posGrupo) {
        const usuariosOrdenados = [...usuariosNuevos].sort((a, b) => b.pinceles - a.pinceles);
        
        const existingUsersMap = new Map();
        usuariosListaEl.querySelectorAll('.usuario-item').forEach(item => {
            existingUsersMap.set(item.dataset.userName, item);
        });

        const newUsersSet = new Set(usuariosOrdenados.map(u => u.nombre));

        for (const [userName, item] of existingUsersMap.entries()) {
            if (!newUsersSet.has(userName)) {
                item.remove();
                existingUsersMap.delete(userName);
            }
        }

        usuariosOrdenados.forEach((usuario, uIndex) => {
            const existingItem = existingUsersMap.get(usuario.nombre);
            if (existingItem) {
                AppUI.actualizarUsuarioItem(existingItem, usuario, uIndex, grupo, posGrupo);
            } else {
                const newItem = AppUI.crearUsuarioItem(usuario, uIndex, grupo, posGrupo);
                usuariosListaEl.appendChild(newItem);
            }
        });

        if (usuariosOrdenados.length === 0 && usuariosListaEl.children.length === 0) {
            usuariosListaEl.innerHTML = `<div class="usuario-item"><span class="usuario-nombre">Sin registros</span></div>`;
        } else if (usuariosOrdenados.length > 0) {
            const noRegistros = usuariosListaEl.querySelector('.usuario-item:only-child .usuario-nombre');
            if (noRegistros && noRegistros.textContent === 'Sin registros') {
                noRegistros.parentElement.remove();
            }
        }
    },

    /**
     * Crea un elemento de grupo completo.
     */
    crearGrupoElement: function(grupo, index) {
        const isNegativeGroup = grupo.nombre === "Cicla";
        let topClass = !isNegativeGroup && index < 6 ? ` top-${index + 1}` : '';
        
        const grupoElement = document.createElement('div');
        grupoElement.className = `grupo-container${topClass}${isNegativeGroup ? ' negative' : ''}`;
        grupoElement.dataset.groupName = grupo.nombre;
        grupoElement.style.order = index;

        const grupoHeader = document.createElement('div');
        grupoHeader.className = 'grupo-header';
        grupoHeader.innerHTML = `
            <div class="grupo-nombre">
                <span>${grupo.nombre}</span>
                ${AppUI.getRankIndicator(index + 1, isNegativeGroup)}
            </div>
            <div class="grupo-total">
                ${AppData.formatNumber(grupo.total)}<span>pinceles</span>
            </div>`;

        const usuariosLista = document.createElement('div');
        usuariosLista.className = 'usuarios-lista';

        AppUI.actualizarUsuariosLista(usuariosLista, grupo.usuarios || [], grupo, index + 1);

        grupoElement.appendChild(grupoHeader);
        grupoElement.appendChild(usuariosLista);
        grupoHeader.addEventListener('click', () => AppUI.toggleGrupo(grupoElement));
        
        return grupoElement;
    },

    /**
     * Actualiza el encabezado de un grupo existente.
     */
    actualizarGrupoHeader: function(grupoElement, grupo, index) {
        const isNegativeGroup = grupo.nombre === "Cicla";
        
        let topClass = !isNegativeGroup && index < 6 ? ` top-${index + 1}` : '';
        // Preserva las clases 'expandido' y 'oculto' si existen
        const extraClasses = ['expandido', 'oculto'].filter(c => grupoElement.classList.contains(c)).join(' ');
        grupoElement.className = `grupo-container${topClass}${isNegativeGroup ? ' negative' : ''} ${extraClasses}`.trim();
        
        grupoElement.style.order = index;

        const nombreEl = grupoElement.querySelector('.grupo-nombre');
        if (nombreEl) {
            nombreEl.innerHTML = `<span>${grupo.nombre}</span>${AppUI.getRankIndicator(index + 1, isNegativeGroup)}`;
        }
        
        const totalEl = grupoElement.querySelector('.grupo-total');
        if (totalEl) {
            totalEl.innerHTML = `${AppData.formatNumber(grupo.total)}<span>pinceles</span>`;
        }
    },

    /**
     * Muestra y reconcilia los datos de los grupos en el DOM.
     */
    mostrarDatos: async function(gruposOrdenados) {
        const container = document.getElementById('grupos-container');

        const ciclaIndex = gruposOrdenados.findIndex(g => g.nombre === "Cicla");
        let ciclaGroup = ciclaIndex !== -1 ? gruposOrdenados.splice(ciclaIndex, 1)[0] : null;
        
        const setInicial = ['Cuarto', 'Quinto', 'Sexto', 'Primero', 'Segundo', 'Tercero'];
        setInicial.forEach(nombre => {
            if (!gruposOrdenados.some(g => g.nombre.trim().toLowerCase() === nombre.toLowerCase())) {
                gruposOrdenados.push({ nombre, total: 0, usuarios: [] });
            }
        });
        
        const principales = gruposOrdenados.filter(g => setInicial.some(n => n.toLowerCase() === g.nombre.trim().toLowerCase()));
        const extras = gruposOrdenados.filter(g => !setInicial.some(n => n.toLowerCase() === g.nombre.trim().toLowerCase()));
        
        let principalesOrdenados = principales.some(g => g.total > 0) 
            ? [...principales].sort((a, b) => b.total - a.total) 
            : setInicial.map(nombre => principales.find(g => g.nombre.trim().toLowerCase() === nombre.toLowerCase()));
        
        extras.sort((a, b) => b.total - a.total);
        
        const gruposParaMostrar = [...principalesOrdenados, ...extras];
        if (ciclaGroup && ciclaGroup.usuarios && ciclaGroup.usuarios.length > 0) {
            gruposParaMostrar.push(ciclaGroup);
        }

        const gruposActivos = gruposParaMostrar.filter(g => g.total !== 0 || g.nombre === "Cicla" || setInicial.includes(g.nombre));

        const openCardEl = container.querySelector('.grupo-container.expandido .grupo-nombre span');
        const openGroupName = openCardEl ? openCardEl.textContent.trim() : null;

        const existingGroupsMap = new Map();
        container.querySelectorAll('.grupo-container').forEach(el => {
            existingGroupsMap.set(el.dataset.groupName, el);
        });

        const newGroupsSet = new Set(gruposActivos.map(g => g.nombre));

        for (const [groupName, element] of existingGroupsMap.entries()) {
            if (!newGroupsSet.has(groupName)) {
                element.remove();
                existingGroupsMap.delete(groupName);
            }
        }

        gruposActivos.forEach((grupo, index) => {
            if (grupo.nombre === "Cicla" && (!grupo.usuarios || grupo.usuarios.length === 0)) {
                const ciclaEl = existingGroupsMap.get("Cicla");
                if (ciclaEl) ciclaEl.remove();
                return;
            }

            const existingElement = existingGroupsMap.get(grupo.nombre);

            if (existingElement) {
                AppUI.actualizarGrupoHeader(existingElement, grupo, index);
                const usuariosListaEl = existingElement.querySelector('.usuarios-lista');
                if (usuariosListaEl) {
                    AppUI.actualizarUsuariosLista(usuariosListaEl, grupo.usuarios || [], grupo, index + 1);
                }
            } else {
                const newGrupoElement = AppUI.crearGrupoElement(grupo, index);
                container.appendChild(newGrupoElement);
            }
        });

        if (openGroupName) {
            const groupToReopen = Array.from(container.querySelectorAll('.grupo-container')).find(g => g.dataset.groupName === openGroupName);
            if (groupToReopen && !groupToReopen.classList.contains('expandido')) {
                AppUI.toggleGrupo(groupToReopen, true); 
            } else if (!groupToReopen) {
                AppUI.closeExpandedGroup();
            }
        }
    },

    /**
     * Muestra/Oculta la lista de usuarios de un grupo.
     */
    toggleGrupo: function(grupoElement, forceOpen = false) {
        const usuariosLista = grupoElement.querySelector('.usuarios-lista');
        const isExpanded = usuariosLista.classList.contains('show');
        const pageOverlay = document.getElementById('page-overlay');
        
        document.querySelectorAll('.grupo-container').forEach(g => {
            g.classList.remove('expandido', 'oculto');
            g.querySelector('.usuarios-lista').classList.remove('show');
        });

        if (!isExpanded || forceOpen) {
            document.querySelectorAll('.grupo-container').forEach(g => {
                if (g !== grupoElement) g.classList.add('oculto');
            });
            grupoElement.classList.add('expandido');
            usuariosLista.classList.add('show');
            pageOverlay.classList.add('active');
        } else {
            pageOverlay.classList.remove('active');
        }
    },

    /**
     * Cierra cualquier grupo que esté expandido.
     */
    closeExpandedGroup: function() {
        const expandedGroup = document.querySelector('.grupo-container.expandido');
        if (expandedGroup) {
            AppUI.toggleGrupo(expandedGroup); 
        }
    },

    /**
     * Muestra una notificación de cambio.
     */
    showChangeNotification: function(usuario, grupo, cambios, tipo = 'normal') {
        const container = document.getElementById('notifications-container');
        const existing = container.querySelectorAll('.change-notification');
        if (existing.length >= 4) {
            existing[0].classList.remove('show');
            setTimeout(() => existing[0].remove(), 300);
        }
        const notification = document.createElement('div');
        notification.className = `change-notification ${tipo}`;
        let iconClass, title, message;
        if (tipo === 'rapid') { iconClass = 'fas fa-bolt'; title = 'CAMBIOS RÁPIDOS'; message = `${usuario} (${grupo}) tuvo ${cambios} cambios en 5 min.`; }
        else if (tipo === 'persistent') { iconClass = 'fas fa-exclamation-triangle'; title = 'CAMBIOS PERSISTENTES'; message = `${usuario} (${grupo}) tuvo ${cambios} cambios en 30 min.`; }
        else { iconClass = 'fas fa-sync-alt'; title = 'CAMBIO DETECTADO'; message = `${usuario} (${grupo}) actualizó sus pinceles.`; }
        notification.innerHTML = `<i class="${iconClass} change-notification-icon"></i><div class="change-notification-content"><div class="change-notification-title">${title}</div><div class="change-notification-message">${message}</div></div>`;
        container.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 600);
        }, AppConfig.CHANGE_NOTIFICATION_DURATION);
    },

    /**
     * Configura los event listeners para los modales.
     */
    setupModals: function() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        });
        document.querySelector('#gestion-titulo').addEventListener('click', () => document.getElementById('gestion-modal').classList.add('active'));
        document.querySelector('#modal-cancel').addEventListener('click', () => document.getElementById('gestion-modal').classList.remove('active'));
        document.querySelector('#modal-submit').addEventListener('click', AppAuth.verificarClave);
        document.querySelector('#clave-input').addEventListener('keypress', (e) => e.key === 'Enter' && AppAuth.verificarClave());
        
        document.querySelector('.close-student-modal').addEventListener('click', () => document.getElementById('student-modal').classList.remove('active'));
        
        document.getElementById('page-overlay').addEventListener('click', AppUI.closeExpandedGroup);
    },

    /**
     * Muestra el modal con la información del estudiante.
     */
    showStudentInfo: function(usuario, grupo, posGrupo, posInd) {
        const modal = document.getElementById('student-modal');
        const infoGrid = document.getElementById('student-info-grid');
        const totalPinceles = usuario.pinceles || 0;
        const posIndClass = posInd >= 1 && posInd <= 6 ? `position-${posInd}` : 'accent';
        const posGrupoClass = posGrupo >= 1 && posGrupo <= 6 ? `position-${posGrupo}` : 'accent';

        infoGrid.innerHTML = `
            <div class="student-info-card"><div class="student-info-label">Grupo</div><div class="student-info-value accent">${grupo.nombre}</div></div>
            <div class="student-info-card"><div class="student-info-label">Posición en Grupo</div><div class="student-info-value ${posIndClass}">${posInd}°</div></div>
            <div class="student-info-card"><div class="student-info-label">Posición del Grupo</div><div class="student-info-value ${posGrupoClass}">${posGrupo}°</div></div>
            <div class="student-info-card"><div class="student-info-label">Total Pinceles</div><div class="student-info-value ${totalPinceles >= 0 ? 'positive' : 'negative'}">${AppData.formatNumber(totalPinceles)}</div></div>
            <div class="student-info-card"><div class="student-info-label">Total Grupo</div><div class="student-info-value accent">${AppData.formatNumber(grupo.total)}</div></div>
            <div class="student-info-card"><div class="student-info-label">% del Grupo</div><div class="student-info-value accent">${grupo.total !== 0 ? ((totalPinceles / grupo.total) * 100).toFixed(1) : 0}%</div></div>`;
        modal.classList.add('active');
    },
    
    /**
     * Oculta la pantalla de bienvenida.
     */
    hideWelcomeScreen: function() {
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.classList.add('hidden');
            setTimeout(() => welcomeScreen.remove(), 1000);
        }
    },

    /**
     * Muestra la pantalla de bienvenida (si es la primera vez).
     */
    showWelcomeScreen: function() {
        if (!sessionStorage.getItem('welcomeShown')) {
            sessionStorage.setItem('welcomeShown', 'true');
            const container = document.querySelector('.welcome-container');
            const redirectMessage = document.getElementById('welcome-redirect-message');
            setTimeout(() => {
                if (container) container.style.opacity = '0';
                if (redirectMessage) redirectMessage.style.opacity = '1';
            }, 4000);
            setTimeout(AppUI.hideWelcomeScreen, 6000);
        } else {
            AppUI.hideWelcomeScreen();
        }
    },
    
    /**
     * Actualiza el contador regresivo para la subasta.
     */
    updateCountdown: function() {
        const container = document.querySelector('.countdown-container');
        if (!container) return;

        function getLastThursday(year, month) {
            const lastDayOfMonth = new Date(year, month + 1, 0);
            let lastThursday = new Date(lastDayOfMonth);
            lastThursday.setDate(lastThursday.getDate() - (lastThursday.getDay() + 3) % 7);
            return lastThursday;
        }

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        let auctionDay = getLastThursday(currentYear, currentMonth);
        const auctionStart = new Date(auctionDay.getFullYear(), auctionDay.getMonth(), auctionDay.getDate(), 0, 0, 0, 0);
        const auctionEnd = new Date(auctionDay.getFullYear(), auctionDay.getMonth(), auctionDay.getDate(), 23, 59, 59, 999);

        if (now >= auctionStart && now <= auctionEnd) {
            container.classList.add('auction-day');
        } else {
            container.classList.remove('auction-day');

            let targetDate = auctionStart;

            if (now > auctionEnd) {
                targetDate = getLastThursday(currentYear, currentMonth + 1);
                targetDate.setHours(0, 0, 0, 0); 
            }

            const distance = targetDate - now;

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            const daysEl = document.getElementById('days');
            const hoursEl = document.getElementById('hours');
            const minutesEl = document.getElementById('minutes');
            const secondsEl = document.getElementById('seconds');

            if(daysEl) daysEl.innerText = String(days).padStart(2, '0');
            if(hoursEl) hoursEl.innerText = String(hours).padStart(2, '0');
            if(minutesEl) minutesEl.innerText = String(minutes).padStart(2, '0');
            if(secondsEl) secondsEl.innerText = String(seconds).padStart(2, '0');
        }
    }
};

// --- MANEJO DE DATOS Y LÓGICA ---
const AppData = {
    /**
     * Formatea un número al estilo de R.D.
     */
    formatNumber: function(num) {
        return new Intl.NumberFormat('es-DO').format(num);
    },

    /**
     * Calcula el próximo reintento con backoff exponencial.
     */
    calculateNextRetryDelay: function() {
        AppState.retryDelay = Math.min(AppState.retryDelay * 2, AppConfig.MAX_RETRY_DELAY);
        return AppState.retryDelay;
    },

    /**
     * Verifica si el caché de datos es válido.
     */
    isCacheValid: function() {
        return AppState.cachedData && AppState.lastCacheTime && (Date.now() - AppState.lastCacheTime < AppConfig.CACHE_DURATION);
    },

    /**
     * Detecta cambios persistentes o rápidos en los datos de usuario.
     */
    detectarCambiosPersistentes: function(nuevosDatos) {
        const ahora = Date.now();
        nuevosDatos.forEach(grupo => {
            grupo.usuarios.forEach(usuario => {
                const claveUsuario = `${grupo.nombre}-${usuario.nombre}`;
                if (!AppState.historialUsuarios[claveUsuario]) {
                    AppState.historialUsuarios[claveUsuario] = { pinceles: usuario.pinceles, cambiosRecientes: [] };
                    return;
                }
                if (usuario.pinceles !== AppState.historialUsuarios[claveUsuario].pinceles) {
                    const cambio = { tiempo: ahora, anterior: AppState.historialUsuarios[claveUsuario].pinceles, nuevo: usuario.pinceles };
                    AppState.historialUsuarios[claveUsuario].pinceles = usuario.pinceles;
                    AppState.historialUsuarios[claveUsuario].cambiosRecientes.push(cambio);

                    AppState.historialUsuarios[claveUsuario].cambiosRecientes = AppState.historialUsuarios[claveUsuario].cambiosRecientes.filter(c => ahora - c.tiempo <= AppConfig.RAPID_CHANGE_THRESHOLD);
                    
                    const positiveChanges = AppState.historialUsuarios[claveUsuario].cambiosRecientes.filter(c => c.nuevo > c.anterior).length;
                    if(positiveChanges >= 2){
                        usuario.trending = true;
                    }

                    if (AppState.historialUsuarios[claveUsuario].cambiosRecientes.length >= AppConfig.RAPID_CHANGE_COUNT) {
                        AppUI.showChangeNotification(usuario.nombre, grupo.nombre, AppState.historialUsuarios[claveUsuario].cambiosRecientes.length, 'rapid');
                    } else {
                        AppUI.showChangeNotification(usuario.nombre, grupo.nombre, 1, 'normal');
                    }
                }
            });
        });
    },

    /**
     * Carga los datos desde la API.
     */
    cargarDatos: async function() {
        if (AppState.actualizacionEnProceso) return;
        AppState.actualizacionEnProceso = true;

        try {
            if (!navigator.onLine) {
                AppState.isOffline = true;
                if (AppData.isCacheValid()) {
                    AppUI.updateConnectionStatus('error', '', true);
                    if (!AppState.datosActuales) await AppUI.mostrarDatos(AppState.cachedData);
                } else {
                    AppUI.updateConnectionStatus('error', 'Sin conexión a internet. Sin datos disponibles.');
                }
                AppState.actualizacionEnProceso = false;
                return;
            }

            AppUI.updateConnectionStatus('updating', 'Actualizando datos...');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            let response;
            try {
                const urlWithCacheBuster = `${AppConfig.API_URL}?v=${new Date().getTime()}`;
                response = await fetch(urlWithCacheBuster, { method: 'GET', cache: 'no-cache', redirect: 'follow', signal: controller.signal });
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'No se pudo leer la respuesta de error.');
                throw new Error(`Error de red: ${response.status}. Respuesta: ${errorText}`);
            }
            const data = await response.json().catch(() => { throw new Error('La respuesta de la API no es un JSON válido.'); });
            if (data && data.error) throw new Error(data.message || 'Error en la API');

            let gruposOrdenados = Object.entries(data).map(([nombre, info]) => ({ nombre, total: info.total || 0, usuarios: info.usuarios || [] }));
            AppState.cachedData = gruposOrdenados;
            AppState.lastCacheTime = Date.now();
            AppState.isOffline = false;

            const negativeUsers = [];
            gruposOrdenados.forEach(grupo => {
                grupo.usuarios = grupo.usuarios.filter(usuario => {
                    if (usuario.pinceles < 0) {
                        negativeUsers.push({ ...usuario, grupoOriginal: grupo.nombre });
                        return false;
                    }
                    return true;
                });
                grupo.total = grupo.usuarios.reduce((sum, user) => sum + user.pinceles, 0);
            });
            if (negativeUsers.length > 0) {
                gruposOrdenados.push({ nombre: "Cicla", total: negativeUsers.reduce((sum, user) => sum + user.pinceles, 0), usuarios: negativeUsers });
            }

            AppData.detectarCambiosPersistentes(gruposOrdenados);

            const datosNuevos = JSON.stringify(gruposOrdenados);
            if (datosNuevos !== JSON.stringify(AppState.datosActuales)) {
                AppState.datosActuales = gruposOrdenados;
                await AppUI.mostrarDatos(gruposOrdenados);
                AppUI.updateConnectionStatus('online', 'Datos actualizados');
            } else {
                AppUI.updateConnectionStatus('online', 'Datos sin cambios');
            }
            AppState.retryCount = 0;
            AppState.retryDelay = AppConfig.INITIAL_RETRY_DELAY;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('La solicitud fue cancelada por timeout (60s).');
                AppUI.updateConnectionStatus('error', 'El servidor tardó demasiado en responder.');
            } else {
                console.error('Error al cargar los datos:', error);
                AppUI.updateConnectionStatus('error', `Error: ${error.message}`, !navigator.onLine);
            }
            if (AppState.retryCount < AppConfig.MAX_RETRIES && navigator.onLine) {
                AppState.retryCount++;
                const nextDelay = AppData.calculateNextRetryDelay();
                AppUI.updateConnectionStatus('updating', `Reintentando en ${nextDelay/1000}s...`);
                setTimeout(AppData.cargarDatos, nextDelay);
            } else if (AppData.isCacheValid()) {
                AppUI.updateConnectionStatus('error', 'Mostrando datos en caché.', true);
                if (!AppState.datosActuales) await AppUI.mostrarDatos(AppState.cachedData);
            } else {
                AppUI.updateConnectionStatus('error', 'Sin datos disponibles.');
            }
        } finally {
            AppState.actualizacionEnProceso = false;
        }
    }
};

// --- INICIALIZACIÓN DE LA APLICACIÓN ---
const AppCore = {
    init: function() {
        AppUI.showWelcomeScreen();
        AppUI.setupModals();
        
        // Listener global para clics en nombres de usuario
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('usuario-nombre')) {
                const usuario = JSON.parse(e.target.dataset.usuario);
                const grupo = JSON.parse(e.target.dataset.grupo);
                AppUI.showStudentInfo(usuario, grupo, e.target.dataset.posicionGrupo, e.target.dataset.posicionIndividual);
            }
        });

        AppData.cargarDatos();
        setInterval(AppData.cargarDatos, 10000);
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
    }
};

// --- EJECUTAR LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', AppCore.init);

