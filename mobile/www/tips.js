/* =====================================================================
   tips.js - plan de mejora por area del Saber 11.
   Cuando un estudiante tiene un area baja en su ultimo simulacro, la app
   le muestra estos tips, unas preguntas de practica y donde practicar.
   Para agregar preguntas: copia un objeto de "preguntas" y cambia el texto.
   "correcta" es la posicion de la opcion buena (0 = la primera).
   ===================================================================== */

const PLANES = {
  matematicas: {
    nombre: "Matemáticas",
    color: "var(--pink)",
    tips: [
      "Antes de calcular, escribe qué te piden y qué datos te dan. La mitad de los errores son de lectura, no de cuentas.",
      "Domina porcentajes, fracciones y regla de tres: aparecen en casi todo el examen disfrazados de situaciones de la vida real.",
      "Si te bloqueas, prueba las opciones de respuesta en el enunciado. A veces es más rápido verificar que despejar.",
    ],
    preguntas: [
      {
        enunciado: "Un celular cuesta $800.000 y tiene 15% de descuento. ¿Cuánto pagas?",
        opciones: ["$680.000", "$785.000", "$120.000", "$720.000"],
        correcta: 0,
        explicacion: "El 15% de 800.000 es 120.000. Entonces 800.000 − 120.000 = 680.000.",
      },
      {
        enunciado: "En una bolsa hay 3 balotas rojas y 5 azules. Si sacas una sin mirar, ¿qué probabilidad hay de que sea roja?",
        opciones: ["3/5", "3/8", "5/8", "1/3"],
        correcta: 1,
        explicacion: "Hay 8 balotas en total y 3 son rojas: 3 de 8, o sea 3/8.",
      },
      {
        enunciado: "Si 2x + 6 = 20, ¿cuánto vale x?",
        opciones: ["13", "10", "7", "8"],
        correcta: 2,
        explicacion: "Resta 6 a los dos lados: 2x = 14. Divide entre 2: x = 7.",
      },
    ],
    plataformas: [
      { nombre: "Khan Academy", url: "https://es.khanacademy.org", detalle: "Videos cortos y ejercicios con pistas, gratis." },
      { nombre: "GeoGebra", url: "https://www.geogebra.org", detalle: "Juega con gráficas y figuras para entender funciones." },
      { nombre: "ICFES", url: "https://www.icfes.gov.co", detalle: "Guías oficiales y preguntas liberadas del Saber 11." },
    ],
  },

  lectura_critica: {
    nombre: "Lectura crítica",
    color: "var(--teal)",
    tips: [
      "Lee primero la pregunta y después el texto: así sabes qué buscar mientras lees.",
      "Fíjate en los conectores (aunque, por lo tanto, sin embargo): te dicen cómo se relacionan las ideas.",
      "Separa lo que el texto dice de lo que tú opinas. La respuesta correcta siempre se puede sostener con el texto.",
    ],
    preguntas: [
      {
        enunciado: "«Aunque llovía, el partido continuó.» La palabra «aunque» expresa…",
        opciones: ["Una causa", "Una consecuencia", "Una oposición entre dos ideas", "Un momento en el tiempo"],
        correcta: 2,
        explicacion: "«Aunque» presenta un obstáculo (la lluvia) que no impidió lo otro (el partido): es una concesión u oposición.",
      },
      {
        enunciado: "«Todos los que practican a diario mejoran su puntaje. Ana mejoró su puntaje.» ¿Qué se puede concluir con certeza?",
        opciones: ["Ana practicó a diario", "Ana no practicó", "No se puede asegurar que Ana practicó a diario", "Todos mejoraron"],
        correcta: 2,
        explicacion: "Ana pudo mejorar por otra razón. Que todos los que practican mejoren no significa que todos los que mejoran practicaron.",
      },
      {
        enunciado: "La intención principal de una columna de opinión es…",
        opciones: ["Convencer al lector de una postura", "Dar instrucciones paso a paso", "Narrar una historia inventada", "Presentar datos sin tomar partido"],
        correcta: 0,
        explicacion: "Una columna de opinión defiende un punto de vista con argumentos para persuadir.",
      },
    ],
    plataformas: [
      { nombre: "Colombia Aprende", url: "https://www.colombiaaprende.edu.co", detalle: "Lecturas y recursos del Ministerio de Educación." },
      { nombre: "ICFES", url: "https://www.icfes.gov.co", detalle: "Cuadernillos de preguntas de lectura crítica." },
      { nombre: "Khan Academy", url: "https://es.khanacademy.org", detalle: "Práctica de comprensión y gramática." },
    ],
  },

  sociales_ciudadanas: {
    nombre: "Sociales y ciudadanas",
    color: "var(--orange)",
    tips: [
      "Repasa la Constitución de 1991: ramas del poder, derechos fundamentales y mecanismos como la tutela.",
      "En las preguntas de situaciones, busca la opción que respete los derechos de todas las partes.",
      "Relaciona los hechos históricos con sus causas y consecuencias, no solo con fechas.",
    ],
    preguntas: [
      {
        enunciado: "En Colombia, ¿qué rama del poder público hace las leyes?",
        opciones: ["La ejecutiva", "La legislativa (el Congreso)", "La judicial", "La organización electoral"],
        correcta: 1,
        explicacion: "El Congreso, que forma la rama legislativa, es quien expide las leyes.",
      },
      {
        enunciado: "La acción de tutela sirve para…",
        opciones: ["Cambiar la Constitución", "Elegir alcaldes", "Proteger de forma rápida los derechos fundamentales", "Cobrar impuestos"],
        correcta: 2,
        explicacion: "La tutela es un mecanismo rápido para que un juez proteja derechos fundamentales vulnerados.",
      },
      {
        enunciado: "La Constitución que rige hoy en Colombia es la de…",
        opciones: ["1886", "1810", "2016", "1991"],
        correcta: 3,
        explicacion: "La Constitución Política vigente se expidió en 1991.",
      },
    ],
    plataformas: [
      { nombre: "Enciclopedia Banrepcultural", url: "https://enciclopedia.banrepcultural.org", detalle: "Historia y cultura de Colombia explicada." },
      { nombre: "Colombia Aprende", url: "https://www.colombiaaprende.edu.co", detalle: "Recursos de ciudadanía y competencias." },
      { nombre: "ICFES", url: "https://www.icfes.gov.co", detalle: "Preguntas liberadas de sociales y ciudadanas." },
    ],
  },

  ciencias_naturales: {
    nombre: "Ciencias naturales",
    color: "var(--violet)",
    tips: [
      "Lee bien las gráficas y tablas: muchas preguntas se responden solo interpretando los datos.",
      "Identifica la variable que cambia y la que se mide en cada experimento.",
      "Repasa conceptos base: fuerza y movimiento, célula, fotosíntesis, mezclas y cambios de estado.",
    ],
    preguntas: [
      {
        enunciado: "Un objeto que cae sin resistencia del aire va cada vez más rápido porque…",
        opciones: ["Su masa aumenta", "La gravedad lo acelera", "Pierde energía", "El aire lo empuja"],
        correcta: 1,
        explicacion: "La gravedad ejerce una fuerza constante hacia abajo que lo acelera.",
      },
      {
        enunciado: "¿Qué produce una planta en la fotosíntesis?",
        opciones: ["Glucosa y oxígeno", "Agua y dióxido de carbono", "Solo agua", "Nitrógeno"],
        correcta: 0,
        explicacion: "Con luz, agua y CO₂, la planta produce glucosa (su alimento) y libera oxígeno.",
      },
      {
        enunciado: "Si mezclas agua y aceite, obtienes…",
        opciones: ["Una solución", "Un compuesto", "Una mezcla heterogénea", "Un elemento"],
        correcta: 2,
        explicacion: "No se disuelven entre sí y se ven dos fases: es una mezcla heterogénea.",
      },
    ],
    plataformas: [
      { nombre: "PhET", url: "https://phet.colorado.edu/es/", detalle: "Simulaciones interactivas de física, química y biología." },
      { nombre: "Khan Academy", url: "https://es.khanacademy.org", detalle: "Videos y ejercicios de ciencias." },
      { nombre: "ICFES", url: "https://www.icfes.gov.co", detalle: "Preguntas liberadas de ciencias naturales." },
    ],
  },

  ingles: {
    nombre: "Inglés",
    color: "var(--yellow)",
    tips: [
      "Practica 10 minutos diarios: la constancia vale más que una sesión larga a la semana.",
      "Aprende los avisos y letreros comunes (No smoking, Keep out…): son preguntas fijas del examen.",
      "Repasa el presente simple y el pasado simple; con ellos resuelves gran parte del examen.",
    ],
    preguntas: [
      {
        enunciado: "She ___ to school every day.",
        opciones: ["go", "goes", "going", "gone"],
        correcta: 1,
        explicacion: "Con she/he/it en presente simple se agrega -s o -es: she goes.",
      },
      {
        enunciado: "A sign in a museum says «Do not touch the paintings». It means…",
        opciones: ["You must touch the paintings", "The paintings are for sale", "You can't touch the paintings", "Touch them carefully"],
        correcta: 2,
        explicacion: "«Do not touch» es una prohibición: no puedes tocar las pinturas.",
      },
      {
        enunciado: "Yesterday I ___ a movie.",
        opciones: ["watched", "watch", "will watch", "watching"],
        correcta: 0,
        explicacion: "«Yesterday» indica pasado, así que se usa el pasado simple: watched.",
      },
    ],
    plataformas: [
      { nombre: "Duolingo", url: "https://www.duolingo.com", detalle: "Lecciones cortas tipo juego para practicar a diario." },
      { nombre: "British Council Teens", url: "https://learnenglishteens.britishcouncil.org", detalle: "Lecturas, gramática y juegos para jóvenes." },
      { nombre: "BBC Learning English", url: "https://www.bbc.co.uk/learningenglish", detalle: "Audios y videos para mejorar el oído." },
    ],
  },
};
