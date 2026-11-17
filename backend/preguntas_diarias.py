"""Banco de preguntas del reto diario de la app de estudiantes.

Cada dia le toca UNA pregunta a todos los estudiantes (la misma para todos).
Se van turnando las cinco areas del Saber 11: lunes una, martes otra, etc.
Cuando se acaban, la lista vuelve a empezar.

Para agregar una pregunta: copia un bloque dentro de su area y cambia el texto.
- "id" debe ser unico y NO se cambia despues (queda guardado en las respuestas).
- "opciones" son siempre 4.
- "correcta" es la posicion de la opcion buena (0 = la primera), tal como esta escrita aqui.
  En la app las opciones salen en otro orden (ver _mezclada), no hay que desordenarlas a mano.
Agrega las nuevas AL FINAL de su area para no mover las que ya estan programadas.
"""

import hashlib
from datetime import date

AREAS = {
    "lectura_critica": "Lectura crítica",
    "matematicas": "Matemáticas",
    "sociales_ciudadanas": "Sociales y ciudadanas",
    "ciencias_naturales": "Ciencias naturales",
    "ingles": "Inglés",
}

BANCO = {
    "lectura_critica": [
        {
            "id": "lec-01",
            "enunciado": "«Aunque llovía a cántaros, Marta salió sin paraguas.» La palabra «aunque» indica que entre las dos ideas hay:",
            "opciones": ["Una causa", "Un contraste", "Una consecuencia", "Una comparación"],
            "correcta": 1,
            "explicacion": "«Aunque» une dos ideas que chocan: lo esperado era que llevara paraguas. Eso es un contraste.",
        },
        {
            "id": "lec-02",
            "enunciado": "Un texto que busca convencer al lector de que apoye una idea, usando razones, es principalmente:",
            "opciones": ["Narrativo", "Descriptivo", "Argumentativo", "Instructivo"],
            "correcta": 2,
            "explicacion": "El texto argumentativo defiende una postura (tesis) con argumentos para convencer.",
        },
        {
            "id": "lec-03",
            "enunciado": "«El 80 % de los jóvenes encuestados usa redes sociales a diario; por eso, los jóvenes ya no leen.» ¿Cuál es el problema de este razonamiento?",
            "opciones": [
                "La cifra es muy alta",
                "La conclusión no se desprende del dato",
                "Usa un porcentaje y no un número",
                "Habla solo de jóvenes",
            ],
            "correcta": 1,
            "explicacion": "Usar redes no demuestra que no lean. El dato existe, pero la conclusión no sale de él.",
        },
        {
            "id": "lec-04",
            "enunciado": "En un artículo, la frase «según la Organización Mundial de la Salud» sirve sobre todo para:",
            "opciones": [
                "Adornar el texto",
                "Dar respaldo a la información con una fuente",
                "Contradecir al autor",
                "Resumir el artículo",
            ],
            "correcta": 1,
            "explicacion": "Citar una fuente reconocida es un argumento de autoridad: respalda lo que se afirma.",
        },
        {
            "id": "lec-05",
            "enunciado": "«Carlos llegó empapado y con el paraguas roto.» Lo que se puede inferir es que:",
            "opciones": [
                "Carlos no tenía paraguas",
                "Hubo lluvia con viento fuerte",
                "Carlos se cayó a un río",
                "Era de noche",
            ],
            "correcta": 1,
            "explicacion": "El texto no lo dice, pero empapado + paraguas roto apunta a lluvia con viento. Eso es inferir.",
        },
        {
            "id": "lec-06",
            "enunciado": "¿Cuál de estas frases es una OPINIÓN y no un hecho?",
            "opciones": [
                "Bogotá es la capital de Colombia",
                "El agua hierve a 100 °C al nivel del mar",
                "El fútbol es el deporte más emocionante",
                "Un año tiene doce meses",
            ],
            "correcta": 2,
            "explicacion": "«Más emocionante» depende de quien lo diga; no se puede comprobar. Las otras sí son verificables.",
        },
        {
            "id": "lec-07",
            "enunciado": "Cuando un autor escribe «¡Qué puntual!» sobre alguien que llegó dos horas tarde, está usando:",
            "opciones": ["Ironía", "Hipérbole", "Comparación", "Definición"],
            "correcta": 0,
            "explicacion": "La ironía dice lo contrario de lo que se quiere dar a entender.",
        },
        {
            "id": "lec-08",
            "enunciado": "La idea principal de un párrafo es:",
            "opciones": [
                "La primera oración, siempre",
                "El ejemplo más largo",
                "Lo que el párrafo afirma en conjunto y las demás oraciones apoyan",
                "La oración con más datos",
            ],
            "correcta": 2,
            "explicacion": "No siempre está al inicio. Es la afirmación que las demás oraciones explican o apoyan.",
        },
        {
            "id": "lec-09",
            "enunciado": "«Estudió mucho; sin embargo, no aprobó.» ¿Qué conector puede reemplazar a «sin embargo» sin cambiar el sentido?",
            "opciones": ["Por lo tanto", "No obstante", "Además", "Es decir"],
            "correcta": 1,
            "explicacion": "«No obstante» también marca oposición. «Por lo tanto» indicaría consecuencia.",
        },
        {
            "id": "lec-10",
            "enunciado": "Una caricatura muestra a un político regando un árbol con billetes mientras el pueblo mira con sed. Su intención es:",
            "opciones": [
                "Enseñar jardinería",
                "Criticar en qué se gasta el dinero público",
                "Promover el ahorro de agua",
                "Elogiar al político",
            ],
            "correcta": 1,
            "explicacion": "La caricatura política critica con humor: aquí, el mal uso de los recursos frente a las necesidades.",
        },
    ],
    "matematicas": [
        {
            "id": "mat-01",
            "enunciado": "Un pantalón cuesta $120.000 y tiene 25 % de descuento. ¿Cuánto pagas?",
            "opciones": ["$95.000", "$90.000", "$100.000", "$30.000"],
            "correcta": 1,
            "explicacion": "El 25 % de 120.000 es 30.000. Entonces 120.000 − 30.000 = 90.000.",
        },
        {
            "id": "mat-02",
            "enunciado": "Si 3 cuadernos cuestan $13.500, ¿cuánto cuestan 5 cuadernos?",
            "opciones": ["$20.500", "$22.500", "$18.000", "$27.000"],
            "correcta": 1,
            "explicacion": "Cada cuaderno vale 13.500 ÷ 3 = 4.500. Cinco valen 5 × 4.500 = 22.500.",
        },
        {
            "id": "mat-03",
            "enunciado": "El promedio de 4, 8, 6 y 10 es:",
            "opciones": ["6", "7", "8", "28"],
            "correcta": 1,
            "explicacion": "Suma: 4 + 8 + 6 + 10 = 28. Divide entre 4 datos: 28 ÷ 4 = 7.",
        },
        {
            "id": "mat-04",
            "enunciado": "Si 3x − 5 = 16, ¿cuánto vale x?",
            "opciones": ["7", "11", "21", "3"],
            "correcta": 0,
            "explicacion": "Suma 5 a los dos lados: 3x = 21. Divide entre 3: x = 7.",
        },
        {
            "id": "mat-05",
            "enunciado": "Un rectángulo mide 8 cm de largo y 5 cm de ancho. ¿Cuál es su área?",
            "opciones": ["13 cm²", "26 cm²", "40 cm²", "80 cm²"],
            "correcta": 2,
            "explicacion": "Área = largo × ancho = 8 × 5 = 40 cm². (26 cm sería el perímetro.)",
        },
        {
            "id": "mat-06",
            "enunciado": "Al lanzar un dado común, ¿qué probabilidad hay de sacar un número par?",
            "opciones": ["1/6", "1/3", "1/2", "2/3"],
            "correcta": 2,
            "explicacion": "Los pares son 2, 4 y 6: tres de seis resultados. 3/6 = 1/2.",
        },
        {
            "id": "mat-07",
            "enunciado": "Un carro recorre 180 km en 3 horas a velocidad constante. ¿Cuántos km recorre en 5 horas?",
            "opciones": ["240 km", "300 km", "360 km", "900 km"],
            "correcta": 1,
            "explicacion": "Va a 180 ÷ 3 = 60 km por hora. En 5 horas: 60 × 5 = 300 km.",
        },
        {
            "id": "mat-08",
            "enunciado": "¿Cuál fracción es equivalente a 0,75?",
            "opciones": ["3/4", "7/5", "3/5", "1/75"],
            "correcta": 0,
            "explicacion": "0,75 = 75/100. Simplificando entre 25 queda 3/4.",
        },
        {
            "id": "mat-09",
            "enunciado": "En un triángulo, dos ángulos miden 50° y 60°. ¿Cuánto mide el tercero?",
            "opciones": ["60°", "70°", "80°", "110°"],
            "correcta": 1,
            "explicacion": "Los ángulos de un triángulo suman 180°. 180 − 50 − 60 = 70°.",
        },
        {
            "id": "mat-10",
            "enunciado": "Un producto subió de $50.000 a $60.000. ¿En qué porcentaje aumentó?",
            "opciones": ["10 %", "16,7 %", "20 %", "120 %"],
            "correcta": 2,
            "explicacion": "Subió 10.000 sobre un precio inicial de 50.000: 10.000 ÷ 50.000 = 0,20 = 20 %.",
        },
    ],
    "sociales_ciudadanas": [
        {
            "id": "soc-01",
            "enunciado": "Según la Constitución de 1991, Colombia es:",
            "opciones": [
                "Una monarquía constitucional",
                "Un Estado social de derecho",
                "Una federación de estados",
                "Un Estado confesional",
            ],
            "correcta": 1,
            "explicacion": "El artículo 1 define a Colombia como un Estado social de derecho, organizado como República unitaria.",
        },
        {
            "id": "soc-02",
            "enunciado": "¿Cuál rama del poder público se encarga de hacer las leyes?",
            "opciones": ["Ejecutiva", "Judicial", "Legislativa", "Electoral"],
            "correcta": 2,
            "explicacion": "El Congreso (Senado y Cámara) es la rama legislativa: hace las leyes.",
        },
        {
            "id": "soc-03",
            "enunciado": "Una persona considera que una entidad le está vulnerando su derecho a la salud. El mecanismo más rápido para protegerlo es:",
            "opciones": ["El referendo", "La acción de tutela", "El plebiscito", "La revocatoria del mandato"],
            "correcta": 1,
            "explicacion": "La tutela protege derechos fundamentales de forma inmediata; el juez debe resolver en máximo 10 días.",
        },
        {
            "id": "soc-04",
            "enunciado": "En un debate, alguien dice: «No le crean, él ni siquiera terminó el colegio». Ese argumento es débil porque:",
            "opciones": [
                "Ataca a la persona y no a lo que dijo",
                "Usa demasiados datos",
                "Es muy corto",
                "Cita a un experto",
            ],
            "correcta": 0,
            "explicacion": "Descalificar a quien habla no refuta su idea. Es la falacia de atacar a la persona.",
        },
        {
            "id": "soc-05",
            "enunciado": "Cuando los precios de casi todos los productos suben de forma sostenida, se habla de:",
            "opciones": ["Inflación", "Devaluación", "Recesión", "Subsidio"],
            "correcta": 0,
            "explicacion": "La inflación es el aumento general y sostenido de los precios; con el mismo dinero se compra menos.",
        },
        {
            "id": "soc-06",
            "enunciado": "Un alcalde propone construir una vía que atraviesa un humedal. Los vecinos, los ambientalistas y los transportadores opinan distinto. Para analizar bien el caso primero hay que:",
            "opciones": [
                "Elegir la opinión de la mayoría",
                "Identificar los intereses de cada grupo",
                "Ignorar a quienes protestan",
                "Apoyar al alcalde por ser la autoridad",
            ],
            "correcta": 1,
            "explicacion": "Las preguntas de ciudadanas piden reconocer que cada actor tiene intereses distintos antes de juzgar.",
        },
        {
            "id": "soc-07",
            "enunciado": "La independencia de Colombia frente a España se consolidó con la batalla de:",
            "opciones": ["Boyacá, en 1819", "Ayacucho, en 1824", "Waterloo, en 1815", "Palonegro, en 1900"],
            "correcta": 0,
            "explicacion": "El 7 de agosto de 1819, en el Puente de Boyacá, el ejército libertador derrotó a las tropas realistas.",
        },
        {
            "id": "soc-08",
            "enunciado": "¿Cuál de estos es un mecanismo de participación ciudadana en Colombia?",
            "opciones": ["El decreto", "La consulta popular", "La sentencia", "El impuesto"],
            "correcta": 1,
            "explicacion": "La consulta popular, el voto, el referendo, el plebiscito y el cabildo abierto son mecanismos de participación.",
        },
        {
            "id": "soc-09",
            "enunciado": "Una noticia dice: «Estudio pagado por una empresa de gaseosas concluye que el azúcar no hace daño». Antes de creerla conviene:",
            "opciones": [
                "Compartirla de inmediato",
                "Revisar quién financió el estudio y si hay otras fuentes",
                "Aceptarla porque es un estudio",
                "Fijarse solo en el titular",
            ],
            "correcta": 1,
            "explicacion": "Quien paga el estudio tiene interés en el resultado. Hay que evaluar la fuente y contrastar.",
        },
        {
            "id": "soc-10",
            "enunciado": "El paso de mucha población del campo a las ciudades se llama:",
            "opciones": ["Globalización", "Migración rural-urbana", "Industrialización", "Colonización"],
            "correcta": 1,
            "explicacion": "Es la migración del campo a la ciudad. En Colombia se aceleró en el siglo XX, también por la violencia.",
        },
    ],
    "ciencias_naturales": [
        {
            "id": "cie-01",
            "enunciado": "¿Cuál organelo se encarga de producir la mayor parte de la energía de la célula?",
            "opciones": ["El núcleo", "La mitocondria", "El ribosoma", "La vacuola"],
            "correcta": 1,
            "explicacion": "En la mitocondria ocurre la respiración celular, que produce energía en forma de ATP.",
        },
        {
            "id": "cie-02",
            "enunciado": "En la fotosíntesis, las plantas toman dióxido de carbono y agua y producen:",
            "opciones": ["Glucosa y oxígeno", "Nitrógeno y agua", "Solo dióxido de carbono", "Proteínas y sal"],
            "correcta": 0,
            "explicacion": "Con la luz, CO₂ + agua se convierten en glucosa (alimento) y se libera oxígeno.",
        },
        {
            "id": "cie-03",
            "enunciado": "Una sustancia con pH 2 es:",
            "opciones": ["Neutra", "Básica", "Ácida", "Salina"],
            "correcta": 2,
            "explicacion": "La escala va de 0 a 14: menos de 7 es ácido, 7 es neutro y más de 7 es básico.",
        },
        {
            "id": "cie-04",
            "enunciado": "Un objeto se mueve en línea recta con velocidad constante. La fuerza neta sobre él es:",
            "opciones": ["Cero", "Igual a su peso", "Cada vez mayor", "Igual a su masa"],
            "correcta": 0,
            "explicacion": "Primera ley de Newton: si la velocidad no cambia, las fuerzas están equilibradas y la neta es cero.",
        },
        {
            "id": "cie-05",
            "enunciado": "En un experimento se riegan plantas iguales con distintas cantidades de agua para medir cuánto crecen. La variable que el investigador cambia a propósito es:",
            "opciones": ["El crecimiento", "La cantidad de agua", "El tipo de planta", "La maceta"],
            "correcta": 1,
            "explicacion": "La variable independiente es la que se manipula (el agua). El crecimiento es la que se mide.",
        },
        {
            "id": "cie-06",
            "enunciado": "Cuando el hielo se derrite ocurre un cambio:",
            "opciones": [
                "Químico, porque se forma otra sustancia",
                "Físico, porque sigue siendo agua",
                "Nuclear",
                "Biológico",
            ],
            "correcta": 1,
            "explicacion": "Cambia el estado (sólido a líquido), pero la sustancia sigue siendo H₂O: es un cambio físico.",
        },
        {
            "id": "cie-07",
            "enunciado": "En una cadena alimenticia: pasto → conejo → zorro. El conejo es un:",
            "opciones": ["Productor", "Consumidor primario", "Consumidor secundario", "Descomponedor"],
            "correcta": 1,
            "explicacion": "El pasto produce su alimento; el conejo, que come plantas, es consumidor primario; el zorro, secundario.",
        },
        {
            "id": "cie-08",
            "enunciado": "El número atómico de un elemento indica la cantidad de:",
            "opciones": ["Neutrones", "Protones", "Moléculas", "Capas de electrones"],
            "correcta": 1,
            "explicacion": "El número atómico (Z) es el número de protones del núcleo, y define qué elemento es.",
        },
        {
            "id": "cie-09",
            "enunciado": "Si un gas encerrado se calienta sin cambiar el tamaño del recipiente, su presión:",
            "opciones": ["Disminuye", "Aumenta", "No cambia", "Desaparece"],
            "correcta": 1,
            "explicacion": "Al calentarse, las partículas se mueven más rápido y chocan más contra las paredes: sube la presión.",
        },
        {
            "id": "cie-10",
            "enunciado": "Los hijos heredan características de sus padres porque estos les transmiten:",
            "opciones": ["Glóbulos rojos", "Genes en el ADN", "Proteínas de la leche", "Anticuerpos"],
            "correcta": 1,
            "explicacion": "La información hereditaria está en los genes, que son segmentos de ADN.",
        },
    ],
    "ingles": [
        {
            "id": "ing-01",
            "enunciado": "Choose the correct option: «She ___ to school every day.»",
            "opciones": ["go", "goes", "going", "gone"],
            "correcta": 1,
            "explicacion": "En presente simple, con he/she/it el verbo lleva -s o -es: she goes.",
        },
        {
            "id": "ing-02",
            "enunciado": "Where can you see this sign? «Please keep off the grass.»",
            "opciones": ["In a park", "In a kitchen", "On a plane", "In a library"],
            "correcta": 0,
            "explicacion": "«Keep off the grass» = no pisar el pasto. Es un aviso típico de un parque.",
        },
        {
            "id": "ing-03",
            "enunciado": "«I ___ my homework yesterday.»",
            "opciones": ["do", "did", "does", "doing"],
            "correcta": 1,
            "explicacion": "«Yesterday» pide pasado simple. El pasado de «do» es «did».",
        },
        {
            "id": "ing-04",
            "enunciado": "A: «How often do you play football?»  B: «___»",
            "opciones": ["In the park.", "Twice a week.", "With my friends.", "Yes, I do."],
            "correcta": 1,
            "explicacion": "«How often» pregunta por la frecuencia: twice a week = dos veces por semana.",
        },
        {
            "id": "ing-05",
            "enunciado": "Which word means the opposite of «cheap»?",
            "opciones": ["Expensive", "Small", "Easy", "Quick"],
            "correcta": 0,
            "explicacion": "Cheap = barato. Su opuesto es expensive = caro.",
        },
        {
            "id": "ing-06",
            "enunciado": "«There aren't ___ apples in the fridge.»",
            "opciones": ["some", "any", "a", "much"],
            "correcta": 1,
            "explicacion": "En oraciones negativas y preguntas se usa «any». «Some» va en afirmativas.",
        },
        {
            "id": "ing-07",
            "enunciado": "«This doctor looks after your teeth.» Who is it?",
            "opciones": ["A dentist", "A vet", "A pilot", "A chef"],
            "correcta": 0,
            "explicacion": "Teeth = dientes. Quien los cuida es el dentist (odontólogo).",
        },
        {
            "id": "ing-08",
            "enunciado": "«If it rains tomorrow, we ___ at home.»",
            "opciones": ["stay", "stayed", "will stay", "staying"],
            "correcta": 2,
            "explicacion": "Primer condicional: if + presente, will + verbo. If it rains, we will stay.",
        },
        {
            "id": "ing-09",
            "enunciado": "«My sister is ___ than me.»",
            "opciones": ["tall", "taller", "tallest", "more tall"],
            "correcta": 1,
            "explicacion": "Para comparar dos personas con adjetivos cortos se agrega -er: taller than.",
        },
        {
            "id": "ing-10",
            "enunciado": "A: «Would you like some coffee?»  B: «___»",
            "opciones": ["Yes, I like.", "No, thanks.", "I am coffee.", "Yes, I would like it yesterday."],
            "correcta": 1,
            "explicacion": "A un ofrecimiento se responde «Yes, please» o «No, thanks».",
        },
    ],
}


def _mezclada(pregunta):
    """Rota las opciones para que la correcta no caiga casi siempre en la misma letra.

    El giro sale del "id", asi que cada pregunta se ve siempre igual (las respuestas
    guardadas apuntan a la posicion que vio el estudiante).
    """
    giro = hashlib.md5(pregunta["id"].encode()).digest()[0] % 4
    opciones = pregunta["opciones"]
    return {
        **pregunta,
        "opciones": opciones[-giro:] + opciones[:-giro] if giro else list(opciones),
        "correcta": (pregunta["correcta"] + giro) % 4,
    }


def _en_orden():
    """Una sola lista que va turnando las areas: lectura, mate, sociales, ciencias, ingles, lectura..."""
    areas = list(BANCO)
    largo = max(len(BANCO[a]) for a in areas)
    lista = []
    for i in range(largo):
        for area in areas:
            if i < len(BANCO[area]):
                lista.append({**_mezclada(BANCO[area][i]), "area": area})
    return lista


PREGUNTAS = _en_orden()


def pregunta_del_dia(dia: date) -> dict:
    """La pregunta que le toca a todos en esa fecha."""
    return PREGUNTAS[dia.toordinal() % len(PREGUNTAS)]
