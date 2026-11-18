# Centro de control · Proyecto MetLife 2026

Panel de control mensual del programa Onboarding CAA de MetLife. Equipo XP.

Cinco vistas: **Resumen** (indicadores, cuenta del proyecto y resumen ejecutivo
imprimible en PDF), **Talleres realizados**, **Generaciones**, **Órdenes de compra**
y **Costos por concepto**. Las cuatro últimas son editables y se guardan solas.

---

## 1. Qué necesitas antes de empezar

- Node.js 20 o superior
- Una cuenta de Google con permiso para crear proyectos en Firebase
- La cuenta de GitHub donde vas a subir el código, si lo vas a abrir en AI Studio

---

## 2. Crear el proyecto en Firebase

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto.
2. **Compilación → Firestore Database → Crear base de datos.** Elige el modo de
   producción y la región `southamerica-east1` o `us-central1`.
3. **Compilación → Authentication → Comenzar → Google.** Actívalo y guarda.
4. En **Authentication → Configuración → Dominios autorizados**, agrega el dominio
   donde vas a publicar el panel.
5. **Configuración del proyecto → Tus apps → Web (`</>`).** Registra una app y copia
   el bloque de configuración que te entrega.

### Reglas de seguridad

Copia el contenido de `firestore.rules` en **Firestore Database → Reglas** y publica.
Esas reglas dejan entrar solo a cuentas verificadas de `@equipoxp.com`. Si usas otro
dominio, cámbialo ahí **y** en la variable `VITE_DOMINIOS_PERMITIDOS`.

> Sin estas reglas la base queda abierta a cualquiera. Es el paso que no conviene saltarse.

---

## 3. Configurar y correr en tu equipo

```bash
cp .env.example .env     # y completa con los datos del paso 2.5
npm install
npm run dev              # abre http://localhost:5173
```

Para generar la versión publicable:

```bash
npm run build            # deja todo en dist/
npm run preview          # para revisarla antes de subir
```

---

## 4. Publicar

### Opción A · Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting    # carpeta pública: dist · app de una sola página: sí
npm run build
firebase deploy
```

### Opción B · Google AI Studio

AI Studio importa desde GitHub, no desde ZIP. El camino es:

1. Sube esta carpeta a un repositorio de GitHub.
2. En AI Studio, botón **+** del cuadro de prompt → **Import from GitHub**.
3. Desde ahí puedes desplegar a Cloud Run o seguir editando con Gemini.

Las variables de entorno se configuran en el panel de AI Studio o Cloud Run; el
archivo `.env` no se sube al repositorio.

### Opción C · GitHub Pages

En `vite.config.ts` cambia `base: './'` por `base: '/nombre-del-repositorio/'`,
corre `npm run build` y publica la carpeta `dist`.

---

## 5. Cómo se guardan los datos

Cada vista es un documento de Firestore:

```
proyectos/{VITE_PROYECTO_ID}/vistas/talleres
proyectos/{VITE_PROYECTO_ID}/vistas/generaciones
proyectos/{VITE_PROYECTO_ID}/vistas/oc
proyectos/{VITE_PROYECTO_ID}/vistas/costos
```

Cada documento guarda `valor` (los datos en JSON), `actualizado` y `por` (el correo
de quien guardó). Como el proyecto va en la ruta, puedes llevar varios clientes en
la misma base cambiando `VITE_PROYECTO_ID`.

**Si se cae la conexión**, el panel sigue funcionando y guarda en el navegador; el
indicador de la esquina lo avisa. **Si otra persona guarda** mientras tienes el panel
abierto, aparece un aviso con un botón para actualizar.

**Sin Firebase configurado** el panel igual funciona, guardando solo en ese navegador.
Sirve para probar antes de conectar nada.

---

## 6. Respaldos

Los botones **Descargar respaldo** y **Cargar respaldo**, abajo a la derecha, bajan y
restauran un JSON con las cuatro vistas. Conviene bajar uno antes de cualquier carga
masiva.

---

## 7. Cargar datos nuevos desde los Excel

Los datos de arranque están en `src/data.js`. Cuando cambien los Excel de origen hay
que actualizar ese archivo y además subir el `seedId` de la vista que cambió:

```js
seedTalleres:     'talleres-...'
seedGeneraciones: 'generaciones-...'
seedOC:           'oc-...'
seedCostos:       'costos-...'
```

Si el `seedId` cambia, esa vista se vuelve a cargar desde el archivo la próxima vez
que alguien abra el panel, pisando lo guardado. Si no cambia, se respeta lo que haya
editado el equipo. Es lo que evita que una carga nueva quede invisible.

---

## 8. Estructura

```
index.html          Marcado de las cinco vistas
src/main.js         Lógica: cálculos, tablas editables, gráficos, resumen ejecutivo
src/firebase.js     Sesión y guardado en Firestore, con respaldo local
src/data.js         Datos de arranque desde los Excel del proyecto
src/styles.css      Estilos, tipografía Poppins y marca XP
firestore.rules     Reglas de seguridad de la base
.env.example        Plantilla de configuración
```

---

## 9. De dónde sale cada número

| Dato | Fuente |
|---|---|
| Costos por concepto | Costo OB CAA METLIFE 2026 · 2025 completo y 2026 enero a septiembre |
| Cuenta del proyecto | Detalle de Cliente MetLife 2025-2026 FINAL |
| Talleres | Bloque Talleres Sence, una fila por sesión |
| Asesores, books y kits | Generaciones, cargados de enero a septiembre |
| Facturación | Órdenes de compra · facturación OTIC más costo empresa |

Montos netos, sin IVA.
