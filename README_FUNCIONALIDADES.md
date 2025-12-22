# 🎬 Gestor de Ventas - Servicios de Streaming

Sistema completo de gestión de ventas de servicios de streaming con React + Supabase.

## ✨ Funcionalidades Implementadas

### 1. **Gestión de Clientes** 👥
- ✅ Crear nuevos clientes (nombre, apellido, teléfono)
- ✅ Editar información de clientes existentes
- ✅ Eliminar clientes
- ✅ Listado con numeración secuencial
- ✅ Capitalización automática de nombres

### 2. **Gestión de Proveedores** 🏪
- ✅ Crear nuevos proveedores (usuario, teléfono)
- ✅ Editar información de proveedores
- ✅ Eliminar proveedores
- ✅ Listado con numeración secuencial
- ✅ Capitalización automática

### 3. **Gestión de Servicios** 📺
- ✅ Crear nuevos servicios (Netflix, Max, etc.)
- ✅ Editar nombres de servicios
- ✅ Eliminar servicios
- ✅ Botón "Gestionar Cuentas" para cada servicio
- ✅ Navegación a página de cuentas específica

### 4. **Gestión de Cuentas de Servicios** 🔐
- ✅ Página dedicada por servicio
- ✅ Crear cuentas con:
  - Correo electrónico
  - Contraseña
  - Precio
  - Proveedor (selector)
  - Fecha de vencimiento (calendario)
- ✅ Editar cuentas existentes
- ✅ Eliminar cuentas
- ✅ **Estados automáticos**:
  - 🟢 **Activa**: Más de 2 días para vencer
  - 🟡 **Por Vencer**: 2 días o menos para vencer
  - 🔴 **Vencida**: Fecha de vencimiento superada
- ✅ Tabla con todas las columnas requeridas
- ✅ Botón "Volver" para regresar a Servicios

### 5. **Diseño y UX** 🎨
- ✅ Iconos Lucide-React en todos los botones
- ✅ Tablas mejoradas con:
  - Gradientes en encabezados
  - Numeración secuencial (#)
  - Hover effects
  - Mejor contraste de colores
- ✅ Modales para crear/editar
- ✅ Capitalización automática de textos
- ✅ Validación de formularios
- ✅ Estados de carga
- ✅ Mensajes de error claros

## 🗄️ Estructura de la Base de Datos

### Tablas Principales:
1. **clientes**: id, nombre, apellido, telefono, creado_en
2. **proveedores**: id, usuario, telefono, creado_en
3. **servicios**: id, nombre, creado_en
4. **cuentas_servicios**: id, servicio_id, proveedor_id, correo, contrasena, precio, fecha_vencimiento, creado_en
5. **ventas**: id, cliente_id, cuenta_servicio_id, fecha_venta, monto, creado_en

## 🚀 Configuración del Proyecto

### 1. Configurar Supabase

1. Ve a [https://supabase.com](https://supabase.com) y crea un proyecto
2. En el **SQL Editor**, ejecuta el script `crear_tablas.sql`
3. (Opcional) Ejecuta `estandarizar_bd.sql` para capitalizar datos existentes
4. Copia tus credenciales:
   - URL del proyecto
   - Anon key

### 2. Configurar el Frontend

1. Crea un archivo `.env` en la carpeta `frontend`:
```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

2. Instala las dependencias:
```bash
cd frontend
npm install
```

3. Inicia el servidor de desarrollo:
```bash
npm run dev
```

## 📂 Archivos SQL Importantes

### `crear_tablas.sql`
- Crea todas las tablas necesarias
- Configura índices para mejor rendimiento
- Incluye datos de ejemplo opcionales

### `estandarizar_bd.sql`
- Capitaliza datos existentes en la BD
- Aplica formato: Primera letra mayúscula, resto minúsculas
- Ejecutar después de crear las tablas si ya tienes datos

## 🎯 Flujo de Uso

1. **Agregar Proveedores**: Primero registra los proveedores de cuentas
2. **Agregar Servicios**: Crea los servicios (Netflix, Max, etc.)
3. **Gestionar Cuentas**: 
   - Haz clic en "Gestionar Cuentas" de un servicio
   - Agrega las cuentas con correo, contraseña, precio, proveedor y fecha de vencimiento
   - El sistema calculará automáticamente el estado (Activa/Por Vencer/Vencida)
4. **Agregar Clientes**: Registra tus clientes
5. **Realizar Ventas**: (Pendiente de implementar)

## 🎨 Tecnologías Utilizadas

- **Frontend**: React 19 + Vite
- **Routing**: React Router DOM v6
- **Base de Datos**: Supabase (PostgreSQL)
- **Estilos**: TailwindCSS
- **Iconos**: Lucide React
- **Client de BD**: @supabase/supabase-js

## 📝 Estados de las Cuentas

El sistema calcula automáticamente el estado de cada cuenta:

```javascript
// Activa: Más de 2 días para vencer
🟢 Estado: Activa

// Por Vencer: 0-2 días para vencer  
🟡 Estado: Por Vencer

// Vencida: Fecha de vencimiento pasada
🔴 Estado: Vencida
```

## 🔒 Seguridad

- Las contraseñas se almacenan en texto plano (considera encriptar en producción)
- Configurar RLS (Row Level Security) en Supabase para producción
- Validar permisos de usuario según necesidad

## 📌 Próximas Funcionalidades

- [ ] Módulo de Ventas completo
- [ ] Dashboard con estadísticas
- [ ] Reportes y análisis
- [ ] Notificaciones de cuentas por vencer
- [ ] Historial de renovaciones
- [ ] Filtros y búsqueda avanzada

## 🤝 Contribución

Este es un proyecto personal. Si encuentras bugs o tienes sugerencias, siéntete libre de crear un issue.

---

**Desarrollado con ❤️ para gestionar servicios de streaming**
