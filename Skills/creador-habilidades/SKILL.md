---
name: creador-habilidades
description: Utiliza esta habilidad cuando el usuario necesite crear una nueva habilidad (skill) para el sistema Antigravity. Proporciona la estructura correcta, el formato de SKILL.md y guías en español.
---

# Instrucciones para el Creador de Habilidades

Esta habilidad te permite generar nuevas capacidades modulares para el agente Antigravity. Sigue estos pasos para crear una habilidad efectiva:

## 1. Estructura de Directorios
Toda nueva habilidad debe residir en su propia carpeta dentro de `Skills/` (o `.agent/skills/` para mayor compatibilidad con el sistema).

```text
Skills/
└── nombre-de-la-habilidad/
    ├── SKILL.md (Obligatorio)
    ├── scripts/ (Opcional: scripts en Python, JS, etc.)
    └── resources/ (Opcional: plantillas o manuales)
```

## 2. Formato de SKILL.md
El archivo `SKILL.md` es el cerebro de la habilidad. Debe comenzar con un frontmatter YAML:

```markdown
---
name: nombre-unico
description: Una descripción clara que ayude al agente a saber cuándo usar esta habilidad.
---

# Instrucciones de [Nombre]
Define aquí los pasos detallados, reglas y ejemplos de uso.
```

## 3. Guía de Creación Paso a Paso
Cuando el usuario te pida una nueva habilidad:
1.  **Define el objetivo**: ¿Qué problema resuelve la habilidad?
2.  **Crea la carpeta**: Usa `write_to_file` con la ruta completa.
3.  **Redacta el SKILL.md**: Asegúrate de que las instrucciones sean precisas y en el idioma del usuario (español).
4.  **Añade recursos**: Si la habilidad requiere scripts o archivos Base, colócalos en `scripts/` o `resources/`.

## Consejos para una buena habilidad
- **Descripción clara**: La descripción en el frontmatter es lo que el sistema usa para seleccionar esta habilidad. Sé específico.
- **Ejemplos**: Incluye ejemplos de "Antes" y "Después" para guiar al agente.
- **Instrucciones granulares**: Divide tareas complejas en pasos pequeños.
