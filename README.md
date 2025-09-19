# 💸 Pay-per-Use Demo con Open Payments

Este repositorio implementa un prototipo simple de pagos **Pay-per-Use** usando el estándar **[Open Payments](https://openpayments.dev/)**.  
La demo consiste en un **backend (Express/Node)** y un **frontend (HTML/JS)** que crean y consultan pagos.

---

## 🚀 Flujo implementado
1. El frontend envía monto + `walletAddress` del comerciante al backend.
2. El backend crea un **Incoming Payment** en `{walletAddress}/incoming-payments`.
3. Devuelve la URL del recurso (incoming payment).
4. El frontend hace *polling* a `/status/:encodedUrl` para ver el estado (`pending`, `completed`, etc.).

---

## 📂 Estructura

