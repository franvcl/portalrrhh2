// ============================================================
// SERVIDOR PUENTE: Noticias del Curso  <-->  Oracle XE (HR)
// ------------------------------------------------------------
// El navegador NO puede conectarse directamente a Oracle.
// Este servidor Node.js recibe las peticiones de la página
// (fetch), consulta la base de datos y devuelve JSON.
//
// Ejecutar:  npm install   (solo la primera vez)
//            npm start
// Abrir:     http://localhost:3000
// ============================================================

const express = require("express");
const oracledb = require("oracledb");
const path = require("path");
const config = require("./config");

const app = express();
const PUERTO = 3000;

// Devolver cada fila como objeto { COLUMNA: valor }
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Permitir llamadas desde Live Server u otro puerto (CORS)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// Servir la página web (carpeta NOTICIASDELCURSO)
app.use(express.static(path.join(__dirname, "..")));

// ---------- Pool de conexiones (se crea una vez y se reutiliza) ----------
let pool = null;
async function obtenerPool() {
    if (!pool) pool = await oracledb.createPool({ ...config, poolMin: 1, poolMax: 5 });
    return pool;
}

// ---------- Función auxiliar para ejecutar consultas ----------
async function consultar(sql, parametros = {}) {
    let conexion;
    try {
        conexion = await (await obtenerPool()).getConnection();
        const resultado = await conexion.execute(sql, parametros);
        return {
            columnas: resultado.metaData.map(col => col.name),
            filas: resultado.rows
        };
    } finally {
        if (conexion) await conexion.close();
    }
}

function manejarError(res, error) {
    console.error("Error Oracle:", error.message);
    res.status(500).json({ ok: false, error: error.message });
}

// ---------- 1. Probar conexión ----------
app.get("/api/hr/estado", async (req, res) => {
    try {
        const datos = await consultar(`
            SELECT USER AS USUARIO,
                   SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS SERVICIO,
                   TO_CHAR(SYSDATE, 'DD/MM/YYYY HH24:MI:SS') AS FECHA_SERVIDOR
            FROM dual`);
        res.json({ ok: true, ...datos.filas[0] });
    } catch (error) {
        manejarError(res, error);
    }
});

// ---------- 2. Resumen: cantidad de registros por tabla ----------
app.get("/api/hr/resumen", async (req, res) => {
    try {
        const datos = await consultar(`
            SELECT (SELECT COUNT(*) FROM regions)     AS REGIONS,
                   (SELECT COUNT(*) FROM countries)   AS COUNTRIES,
                   (SELECT COUNT(*) FROM locations)   AS LOCATIONS,
                   (SELECT COUNT(*) FROM departments) AS DEPARTMENTS,
                   (SELECT COUNT(*) FROM jobs)        AS JOBS,
                   (SELECT COUNT(*) FROM employees)   AS EMPLOYEES,
                   (SELECT COUNT(*) FROM job_history) AS JOB_HISTORY
            FROM dual`);
        res.json(datos.filas[0]);
    } catch (error) {
        manejarError(res, error);
    }
});

// ---------- 3. Departamentos con su ciudad y cantidad de empleados ----------
app.get("/api/hr/departamentos", async (req, res) => {
    try {
        const datos = await consultar(`
            SELECT d.department_id   AS ID,
                   d.department_name AS NOMBRE,
                   l.city            AS CIUDAD,
                   COUNT(e.employee_id) AS EMPLEADOS
            FROM departments d
            LEFT JOIN locations l   ON l.location_id = d.location_id
            LEFT JOIN employees e ON e.department_id = d.department_id
            GROUP BY d.department_id, d.department_name, l.city
            ORDER BY d.department_name`);
        res.json(datos.filas);
    } catch (error) {
        manejarError(res, error);
    }
});

// ---------- 4. Empleados con su cargo, departamento y ciudad ----------
//      Filtros opcionales: ?departamento=90&buscar=king
app.get("/api/hr/empleados", async (req, res) => {
    const departamento = req.query.departamento || null;
    const buscar = (req.query.buscar || "").trim();
    try {
        // Se usan variables de enlace (:depto, :texto) para evitar inyección SQL
        const datos = await consultar(`
            SELECT e.employee_id                       AS "ID",
                   e.first_name || ' ' || e.last_name   AS "Nombre",
                   e.email                             AS "Email",
                   j.job_title                         AS "Cargo",
                   d.department_name                   AS "Departamento",
                   l.city                              AS "Ciudad",
                   e.salary                            AS "Salario",
                   TO_CHAR(e.hire_date, 'DD/MM/YYYY')  AS "Contratación"
            FROM employees e
            JOIN jobs j             ON j.job_id = e.job_id
            LEFT JOIN departments d ON d.department_id = e.department_id
            LEFT JOIN locations l   ON l.location_id = d.location_id
            WHERE (:depto IS NULL OR e.department_id = :depto)
              AND (:texto IS NULL
                   OR UPPER(e.first_name || ' ' || e.last_name) LIKE '%' || UPPER(:texto) || '%')
            ORDER BY e.last_name, e.first_name`,
            { depto: departamento ? Number(departamento) : null, texto: buscar || null });
        res.json(datos);
    } catch (error) {
        manejarError(res, error);
    }
});

// ---------- 5. Ver cualquier tabla del esquema HR ----------
const TABLAS_PERMITIDAS = ["REGIONS", "COUNTRIES", "LOCATIONS", "DEPARTMENTS", "JOBS", "EMPLOYEES", "JOB_HISTORY"];

app.get("/api/hr/tabla/:nombre", async (req, res) => {
    const nombre = req.params.nombre.toUpperCase();
    if (!TABLAS_PERMITIDAS.includes(nombre)) {
        return res.status(400).json({ ok: false, error: "Tabla no permitida" });
    }
    try {
        const datos = await consultar(`SELECT * FROM ${nombre} FETCH FIRST 200 ROWS ONLY`);
        res.json(datos);
    } catch (error) {
        manejarError(res, error);
    }
});

// ---------- Cargos y rangos salariales (para el Evaluador de Salario) ----------
app.get("/api/hr/cargos", async (req, res) => {
    try {
        const datos = await consultar(`
            SELECT job_id     AS "JOB_ID",
                   job_title  AS "JOB_TITLE",
                   min_salary AS "MIN_SALARY",
                   max_salary AS "MAX_SALARY"
            FROM jobs
            ORDER BY job_title`);
        res.json(datos.filas);
    } catch (error) {
        manejarError(res, error);
    }
});

// ---------- Iniciar: crear pool de conexiones y levantar servidor ----------
async function iniciar() {
    try {
        await obtenerPool();
        console.log("✅ Conectado a Oracle XE:", config.connectString, "usuario", config.user);
    } catch (error) {
        console.error("❌ No se pudo conectar a Oracle:", error.message);
        console.error("   Revisa servidor/config.js y que Oracle XE esté encendido.");
    }
    app.listen(PUERTO, () => {
        console.log(`🌐 Abre la página en: http://localhost:${PUERTO}`);
    });
}

iniciar();