# 🔌 Repositorio Oficial de Complementos de Onicord

Este repositorio alberga los complementos (addons) oficiales y comunitarios para **Onicord**.

## 📁 Estructura del Repositorio

- **`index.json`**: Catálogo oficial de complementos registrado.
- **`plugins/`**: Paquetes de distribución `package.onipkg` organizados estrictamente por el ID del complemento.

## 🚀 Cómo agregar un nuevo complemento

1. Crea una carpeta con tu complemento.
2. Incluye tu `manifest.json`, código fuente e iconos.
3. Ejecuta `node scripts/pack-addons-repo.cjs` para generar los paquetes `package.onipkg` e indexar el catálogo `index.json`.
4. Realiza un Commit y Push a tu repositorio de GitHub.
