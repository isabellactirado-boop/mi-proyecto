
        // Leer el rol ingresado desde la URL del login
        const params = new URLSearchParams(window.location.search);
        let selectedRole = params.get('rol') || 'estudiante';

        // Validar que sea un rol permitido
        if (!['estudiante', 'admin', 'docente'].includes(selectedRole)) {
            selectedRole = 'estudiante';
        }

        // Mostrar ÚNICAMENTE el panel del rol correspondiente
        document.getElementById(selectedRole).classList.add('active');

        // Mostrar ÚNICAMENTE la opción del menú lateral del rol correspondiente
        const menuItem = document.getElementById('menu-' + selectedRole);
        if (menuItem) {
            menuItem.classList.add('visible');
        }
    