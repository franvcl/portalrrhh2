// ============================================================
// PORTAL RR.HH. - JavaScript
// Funcionalidades: navegación, departamentos, equipo, 
// evaluador salarial, agenda y conexión Oracle HR
// ============================================================

// ---------- 1. NAVEGACIÓN Y MENÚ RESPONSIVE ----------
const enlaces = document.querySelectorAll("[data-seccion]");
const secciones = document.querySelectorAll(".seccion");
const menuPrincipal = document.getElementById("menuPrincipal");
const btnMenu = document.getElementById("btnMenu");

// Función para mostrar la sección seleccionada y ocultar las demás
function mostrarSeccion(nombre) {
    secciones.forEach(seccion => seccion.classList.remove("activa"));
    const destino = document.getElementById(nombre);
    if (destino) destino.classList.add("activa");

    document.querySelectorAll(".sidebar-nav a").forEach(enlace => {
        enlace.classList.toggle("activo", enlace.dataset.seccion === nombre);
    });

    menuPrincipal.classList.remove("visible");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// Evento click en los enlaces del menú
enlaces.forEach(enlace => {
    enlace.addEventListener("click", evento => {
        evento.preventDefault();
        mostrarSeccion(enlace.dataset.seccion);
    });
});

// Abrir/cerrar la barra lateral en pantallas pequeñas
btnMenu.addEventListener("click", () => {
    const sidebar = document.getElementById("sidebarMenu");
    if (sidebar) sidebar.classList.toggle("visible");
});

// Evento para abrir/cerrar el menú en dispositivos móviles
//btnMenu.addEventListener("click", () => {
//    menuPrincipal.classList.toggle("visible");
//});


// ---------- 2. CONEXIÓN Y CONFIGURACIÓN API ORACLE HR ----------
const API_URL = location.port === "3000" ? "" : "http://localhost:3000";

// Función genérica para realizar peticiones HTTP (fetch) al servidor Node.js
async function pedirAPI(ruta) {
    const respuesta = await fetch(API_URL + ruta);
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "Error en el servidor");
    return datos;
}

// Evita inyecciones de código escapando caracteres especiales de texto
function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Formatea números y fechas provenientes de la base de datos
function formatearValor(valor) {
    if (valor === null || valor === undefined) return "—";
    if (typeof valor === "number") return valor.toLocaleString("es-CL");
    if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) return new Date(valor).toLocaleDateString("es-CL");
    return escaparHTML(valor);
}


// ---------- 3. DEPARTAMENTOS (Sección Obligatoria 2) ----------
// ============================================================
// PORTAL RR.HH. - JavaScript
// ============================================================
const gridDepartamentos = document.getElementById("gridDepartamentos");
const contadorDepartamentos = document.getElementById("contadorDepartamentos");

// Carga los departamentos, su ciudad y su cantidad de empleados desde el servidor
async function cargarDepartamentos() {
    try {
        const departamentos = await pedirAPI("/api/hr/departamentos");
        contadorDepartamentos.textContent = `${departamentos.length} departamentos`;
        
        // --- LÍNEA AÑADIDA PARA EL KPI DEL DASHBOARD ---
        const kpiDept = document.getElementById("kpiDepartamentos");
        if (kpiDept) kpiDept.textContent = departamentos.length;
        // ----------------------------------------------

        gridDepartamentos.innerHTML = departamentos.map(dept => `
            <div class="tarjeta-departamento">
                <h3>${escaparHTML(dept.NOMBRE)}</h3>
                <p>📍 Ciudad: <strong>${escaparHTML(dept.CIUDAD || "No especificada")}</strong></p>
                <p>👥 <strong>${dept.EMPLEADOS}</strong> empleados activos</p>
            </div>
        `).join("");
    } catch (error) {
        gridDepartamentos.innerHTML = `<p>❌ Error al cargar departamentos: ${escaparHTML(error.message)}</p>`;
        contadorDepartamentos.textContent = "Error";
    }
}

// ---------- 4. EQUIPO / EMPLEADOS (Sección Obligatoria 3) ----------
const tablaEmpleados = document.getElementById("tablaEmpleados");
const buscadorEmpleado = document.getElementById("buscadorEmpleado");
const filtroDepartamentoEquipo = document.getElementById("filtroDepartamentoEquipo");

// Carga las opciones del selector de departamentos en la sección Equipo
async function cargarFiltroDepartamentosEquipo() {
    try {
        const departamentos = await pedirAPI("/api/hr/departamentos");
        filtroDepartamentoEquipo.innerHTML = '<option value="">Todos los departamentos</option>' + 
            departamentos.map(d => `<option value="${d.ID}">${escaparHTML(d.NOMBRE)}</option>`).join("");
    } catch (error) {
        console.error("Error al cargar departamentos para el filtro:", error);
    }
}

// Carga y filtra la tabla de empleados desde el servidor considerando departamento y texto
async function cargarEmpleados() {
    const depto = filtroDepartamentoEquipo.value;
    const buscar = buscadorEmpleado.value.trim();
    tablaEmpleados.innerHTML = "<p>Cargando empleados...</p>";

    try {
        // Construimos los parámetros de búsqueda de forma dinámica
        const parametros = new URLSearchParams();
        if (depto) parametros.append("departamento", depto);
        if (buscar) parametros.append("buscar", buscar);

        const datos = await pedirAPI(`/api/hr/empleados?${parametros.toString()}`);
        
        if (!datos.filas || datos.filas.length === 0) {
            tablaEmpleados.innerHTML = "<p>No se encontraron empleados con los filtros seleccionados.</p>";
            return;
        }

        const encabezado = datos.columnas.map(col => `<th>${escaparHTML(col)}</th>`).join("");
        const cuerpo = datos.filas.map(fila => 
            "<tr>" + datos.columnas.map(col => `<td>${formatearValor(fila[col])}</td>`).join("") + "</tr>"
        ).join("");

        tablaEmpleados.innerHTML = `<table><thead><tr>${encabezado}</tr></thead><tbody>${cuerpo}</tbody></table>`;
    } catch (error) {
        tablaEmpleados.innerHTML = `<p>❌ Error al cargar empleados: ${escaparHTML(error.message)}</p>`;
    }
}

// Eventos para activar los filtros al cambiar de opción o escribir
filtroDepartamentoEquipo.addEventListener("change", cargarEmpleados);
buscadorEmpleado.addEventListener("input", cargarEmpleados);


// ---------- 5. EVALUADOR DE SALARIO (Sección Obligatoria 4) ----------
const selectCargo = document.getElementById("selectCargo");
const inputSalario = document.getElementById("inputSalario");
const btnEvaluarSalario = document.getElementById("btnEvaluarSalario");
const resultadoSalario = document.getElementById("resultadoSalario");

// Variable global para almacenar los rangos de los cargos en memoria
let listaCargos = [];

// Carga los cargos desde la nueva ruta del servidor (/api/hr/cargos)
async function cargarCargos() {
    try {
        listaCargos = await pedirAPI("/api/hr/cargos");
        selectCargo.innerHTML = '<option value="">Seleccione un cargo...</option>' + 
            listaCargos.map(cargo => `<option value="${cargo.JOB_ID}">${escaparHTML(cargo.JOB_TITLE)} (Mín: $${cargo.MIN_SALARY} - Máx: $${cargo.MAX_SALARY})</option>`).join("");
    } catch (error) {
        selectCargo.innerHTML = '<option value="">Error al cargar cargos</option>';
    }
}

// Evalúa si el salario ingresado está bajo, dentro o sobre el rango del cargo usando if / else
btnEvaluarSalario.addEventListener("click", () => {
    const idCargoSeleccionado = selectCargo.value;
    const salarioIngresado = parseFloat(inputSalario.value);

    if (!idCargoSeleccionado) {
        resultadoSalario.textContent = "⚠️ Por favor, seleccione un cargo.";
        return;
    }

    if (isNaN(salarioIngresado) || salarioIngresado <= 0) {
        resultadoSalario.textContent = "⚠️ Por favor, ingrese un monto de salario válido.";
        return;
    }

    // Buscamos el cargo seleccionado en nuestro arreglo cargado
    const cargoObj = listaCargos.find(c => c.JOB_ID === idCargoSeleccionado);
    if (!cargoObj) return;

    const min = cargoObj.MIN_SALARY;
    const max = cargoObj.MAX_SALARY;

    // Lógica condicional (if / else) requerida para el evaluador
    if (salarioIngresado < min) {
        resultadoSalario.innerHTML = `🔴 <strong>Bajo el rango:</strong> El salario ingresado ($${salarioIngresado.toLocaleString("es-CL")}) está por debajo del mínimo establecido para <strong>${escaparHTML(cargoObj.JOB_TITLE)}</strong> ($${min.toLocaleString("es-CL")}).`;
    } else if (salarioIngresado > max) {
        resultadoSalario.innerHTML = `🟡 <strong>Sobre el rango:</strong> El salario ingresado ($${salarioIngresado.toLocaleString("es-CL")}) supera el máximo establecido para <strong>${escaparHTML(cargoObj.JOB_TITLE)}</strong> ($${max.toLocaleString("es-CL")}).`;
    } else {
        resultadoSalario.innerHTML = `🟢 <strong>Dentro del rango:</strong> El salario ingresado ($${salarioIngresado.toLocaleString("es-CL")}) se encuentra perfectamente adecuado entre el mínimo y máximo para <strong>${escaparHTML(cargoObj.JOB_TITLE)}</strong>.`;
    }
});


// ---------- 6. AGENDA DE RR.HH. (Con localStorage y ordenamiento cronológico) ----------
const fechaActividad = document.getElementById("fechaActividad");
const nombreActividad = document.getElementById("nombreActividad");
const btnAgregarActividad = document.getElementById("btnAgregarActividad");
const listaActividades = document.getElementById("listaActividades");

// Carga las actividades guardadas previamente en el navegador o inicia un arreglo vacío
let actividades = JSON.parse(localStorage.getItem("agendaRRHH")) || [];

// Muestra las actividades ordenadas por fecha (de la más cercana a la más lejana)
function mostrarActividades() {

    // --- LÍNEA AÑADIDA PARA EL KPI DE AGENDA ---
    const kpiAgenda = document.getElementById("kpiActividades");
    if (kpiAgenda) kpiAgenda.textContent = actividades.length;
    // -------------------------------------------
    
    if (actividades.length === 0) {
        listaActividades.innerHTML = "<p class='contador'>No hay actividades agendadas.</p>";
        return;
    }

    // Ordenar cronológicamente usando el objeto Date
    actividades.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Renderizar la lista con un botón para eliminar cada elemento
    listaActividades.innerHTML = actividades.map((act, index) => `
        <div class="actividad" style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; padding: 0.75rem; background: #f8fafc; border: 1px solid var(--color-borde); border-radius: var(--radio);">
            <span>📅 <strong>${act.fecha}</strong>: ${escaparHTML(act.nombre)}</span>
            <button onclick="eliminarActividad(${index})" class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #ef4444; color: white; border: none; border-radius: var(--radio); cursor: pointer;">Eliminar</button>
        </div>
    `).join("");
}

// Agrega una nueva actividad, la persiste en localStorage y refresca la pantalla
btnAgregarActividad.addEventListener("click", () => {
    const fecha = fechaActividad.value;
    const nombre = nombreActividad.value.trim();

    if (!fecha || !nombre) {
        alert("Por favor completa la fecha y la descripción de la actividad.");
        return;
    }

    actividades.push({ fecha, nombre });
    localStorage.setItem("agendaRRHH", JSON.stringify(actividades));
    
    // Limpiar campos del formulario
    nombreActividad.value = "";
    fechaActividad.value = "";
    
    mostrarActividades();
});

// Función global para eliminar una actividad específica de la agenda
window.eliminarActividad = function(index) {
    actividades.splice(index, 1);
    localStorage.setItem("agendaRRHH", JSON.stringify(actividades));
    mostrarActividades();
};

// 7. ---------- EMPLEADO DEL MES (Sección a Elección) ----------
const inputFotoEmpleado = document.getElementById("inputFotoEmpleado");
const editorEmpleadoMes = document.getElementById("editorEmpleadoMes");
const previewEmpleadoMes = document.getElementById("previewEmpleadoMes");
const nombreEmpleadoMes = document.getElementById("nombreEmpleadoMes");
const tituloNombreEmpleado = document.getElementById("tituloNombreEmpleado");

let grisEmpleado = false;
let brilloEmpleado = 100;
let rotacionEmpleado = 0; // Variable para almacenar los grados de rotación

// Actualiza el nombre del empleado en tiempo real mientras se escribe en el input
nombreEmpleadoMes.addEventListener("input", () => {
    const texto = nombreEmpleadoMes.value.trim();
    tituloNombreEmpleado.textContent = texto ? texto : "Nombre del empleado";
});

// Carga la imagen seleccionada utilizando FileReader
inputFotoEmpleado.addEventListener("change", evento => {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    if (!archivo.type.startsWith("image/")) {
        alert("Por favor selecciona un archivo de imagen válido.");
        return;
    }

    const lector = new FileReader();
    lector.addEventListener("load", () => {
        previewEmpleadoMes.src = lector.result;
        editorEmpleadoMes.classList.remove("oculto");
        restaurarFiltrosEmpleado();
    });
    lector.readAsDataURL(archivo);
});

// Aplica los filtros CSS (grises, brillo y rotación) a la imagen
function aplicarFiltrosEmpleado() {
    previewEmpleadoMes.style.filter = `grayscale(${grisEmpleado ? 100 : 0}%) brightness(${brilloEmpleado}%)`;
    previewEmpleadoMes.style.transform = `rotate(${rotacionEmpleado}deg)`;
}

document.getElementById("btnGrisEmpleado").addEventListener("click", () => {
    grisEmpleado = !grisEmpleado;
    aplicarFiltrosEmpleado();
});

document.getElementById("btnBrilloEmpleado").addEventListener("click", () => {
    brilloEmpleado = brilloEmpleado === 100 ? 130 : 100;
    aplicarFiltrosEmpleado();
});

// Evento para rotar la imagen 90 grados en cada clic
document.getElementById("btnRotarEmpleado").addEventListener("click", () => {
    rotacionEmpleado += 90;
    aplicarFiltrosEmpleado();
});

document.getElementById("btnRestaurarEmpleado").addEventListener("click", restaurarFiltrosEmpleado);

function restaurarFiltrosEmpleado() {
    grisEmpleado = false;
    brilloEmpleado = 100;
    rotacionEmpleado = 0; // Restablece la rotación a 0 grados
    aplicarFiltrosEmpleado();
}

// Elementos para el almacenamiento del Empleado del Mes
const btnGuardarEmpleadoMes = document.getElementById("btnGuardarEmpleadoMes");
const empleadoGuardadoContainer = document.getElementById("empleadoGuardadoContainer");

// Función para mostrar el empleado guardado en el localStorage al cargar la página
function cargarEmpleadoGuardado() {
    const empleadoGuardado = JSON.parse(localStorage.getItem("empleadoDelMes"));
    
    if (!empleadoGuardado) {
        empleadoGuardadoContainer.innerHTML = "<p>No hay ningún empleado guardado todavía.</p>";
        return;
    }

    empleadoGuardadoContainer.innerHTML = `
        <div style="max-width: 280px; margin: 0 auto; padding: 1rem; border: 1px solid var(--color-borde); border-radius: var(--radio); background: #f8fafc;">
            <img src="${empleadoGuardado.foto}" alt="Foto empleado" style="width: 100%; height: 200px; object-fit: cover; border-radius: 4px; filter: grayscale(${empleadoGuardado.grises ? 100 : 0}%) brightness(${empleadoGuardado.brillo}%); transform: rotate(${empleadoGuardado.rotacion}deg);">
            <h4 style="margin-top: 0.75rem; color: var(--color-texto);">${escaparHTML(empleadoGuardado.nombre)}</h4>
        </div>
    `;
}

// Evento para guardar los datos actuales en el localStorage
btnGuardarEmpleadoMes.addEventListener("click", () => {
    const nombre = nombreEmpleadoMes.value.trim();
    const fotoSrc = previewEmpleadoMes.src;

    if (!nombre) {
        alert("Por favor ingresa el nombre del empleado.");
        return;
    }

    if (!fotoSrc || fotoSrc === "") {
        alert("Por favor selecciona una fotografía primero.");
        return;
    }

    // Creamos el objeto con la información y los filtros actuales
    const datosEmpleado = {
        nombre: nombre,
        foto: fotoSrc,
        grises: grisEmpleado,
        brillo: brilloEmpleado,
        rotacion: rotacionEmpleado
    };

    // Guardamos en localStorage
    localStorage.setItem("empleadoDelMes", JSON.stringify(datosEmpleado));
    
    alert("¡Empleado del mes guardado con éxito!");
    cargarEmpleadoGuardado(); // Actualizamos la vista inmediatamente
});

// Llamar a esta función al iniciar la página para que cargue si ya había uno guardado
cargarEmpleadoGuardado();

// ---------- 8. INICIALIZACIÓN DE LA APLICACIÓN ----------
// Se ejecutan al cargar la página para poblar los datos iniciales
cargarDepartamentos();
cargarCargos();
mostrarActividades();
cargarFiltroDepartamentosEquipo();
cargarEmpleados();