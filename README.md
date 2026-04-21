# 🤖 Nexgeneration Bot

Bot de Discord multifuncional para gestión avanzada de servidores, con soporte para sugerencias, sorteos, autoroles, automod y más.

---

## ✨ Características

- 🛡️ **Automoderación** — Lista de palabras prohibidas con roles y usuarios ignorados
- 💡 **Sistema de Sugerencias** — Para usuarios y staff, con aprobación y rechazo
- 🎉 **Sorteos** — Sorteos normales y con requisito de experiencia, con reroll
- 🎭 **Reaction Roles & Autoroles** — Asignación de roles por reacción al unirse
- 📊 **Logs internos** — Registro de acciones en canal dedicado
- 🔍 **Monitor de internet** — Detecta caídas y las registra automáticamente
- 💓 **Heartbeat de uptime** — Mantiene el bot activo con ping periódico
- 🐞 **Modo debug automático** — Se activa solo ante errores críticos, con recuperación automática

---

## 🚀 Instalación

```bash
git clone https://github.com/TheGaspyGames/Nexgeneration
cd Nexgeneration
npm install
cp .env.example .env
# Rellenar las variables en .env
node index.js
```

---

## ⚙️ Variables de entorno (`.env`)

```env
# Requeridas
TOKEN=tu_token_de_discord
CLIENT_ID=id_de_tu_aplicacion
GUILD_ID=id_de_tu_servidor

# Opcionales
MONGODB_URI=tu_uri_de_mongodb
UPTIME=url_de_uptime_opcional
LOG_LEVEL=INFO
SKIP_GLOBAL_COMMANDS=false
DEPLOY_GUILD_COMMANDS=false
```

---

## 📁 Estructura del proyecto

```
Nexgeneration/
├── index.js                  # Entrada principal del bot
├── deploy-commands.js        # Script manual para registrar comandos
├── package.json
├── .env.example              # Plantilla de variables de entorno
├── config/
│   └── config.js             # Configuración del servidor (logs, automod, etc.)
└── src/
    ├── commands/             # Comandos slash organizados por categoría
    │   ├── admin/            # Automod y gestión
    │   ├── sugerencias/      # Sistema de sugerencias
    │   ├── sorteos/          # Sorteos y rerolls
    │   ├── roles/            # Reaction roles y autoroles
    │   ├── config/           # Configuración del bot
    │   └── util/             # Utilidades (ping, update)
    ├── events/               # Eventos de Discord
    ├── features/             # Funcionalidades extendidas
    ├── models/               # Modelos de MongoDB
    └── utils/                # Utilidades internas
        ├── logger.js         # Logger con colores ANSI y niveles
        ├── performance.js    # TimedCache y BackgroundQueue
        ├── commandRegistration.js
        ├── automodCache.js
        └── tabletSuggestions.js
```

---

## 🛠️ Scripts disponibles

| Script | Comando | Descripción |
|---|---|---|
| Producción | `npm start` | Inicia el bot con `node` |
| Desarrollo | `npm run dev` | Inicia con `nodemon` (hot reload) |
| Actualizar | `npm run update` | Git pull + npm install + restart PM2 |

---

## 📝 Notas

- El bot entra en **modo debug automáticamente** si detecta un error crítico durante el inicio. Solo el comando `/update` queda disponible en ese estado.
- Los logs internos se envían a un canal de Discord configurado en `config/config.js`.
- Se recomienda usar **PM2** para mantener el bot activo en producción.

---

## 📄 Licencia

Proyecto privado — Todos los derechos reservados.
