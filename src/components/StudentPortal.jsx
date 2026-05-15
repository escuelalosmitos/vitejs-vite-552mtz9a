import React, { useState, useEffect } from 'react';
import { Music, LogOut, Calendar, Ticket, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight, MapPin, X, Clock, FileText, Check, Bell, Megaphone, Snowflake, RefreshCcw, PlusCircle, UserMinus, Send, Mail, Sun, Sparkles, MonitorPlay, DoorOpen, Star, Trophy, Timer } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, collectionGroup, onSnapshot } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];

// --- BANCO DE PREGUNTAS (150 PREGUNTAS - CARRUSEL DESORDENADO MATEMÁTICAMENTE) ---
const TRIVIA_QUESTIONS = [
  // Teoría [0-49]
  { q: "¿Cuántas líneas tiene un pentagrama?", options: ["4", "5", "6", "7"], correct: 1 },
  { q: "¿Qué figura musical dura 4 tiempos en 4/4?", options: ["Blanca", "Negra", "Redonda", "Corchea"], correct: 2 },
  { q: "¿Qué símbolo eleva medio tono una nota?", options: ["Bemol", "Becuadro", "Calderón", "Sostenido"], correct: 3 },
  { q: "¿Qué significa la indicación 'Forte' (f)?", options: ["Tocar rápido", "Tocar fuerte", "Tocar suave", "Parar"], correct: 1 },
  { q: "¿Cuántos tiempos dura una blanca con puntillo?", options: ["1", "2", "3", "4"], correct: 2 },
  { q: "¿Qué clave lee normalmente el bajo eléctrico?", options: ["Sol", "Fa", "Do", "Re"], correct: 1 },
  { q: "¿Cuál es el tempo habitual de una balada?", options: ["60-80 BPM", "120-140 BPM", "160-180 BPM", "200+ BPM"], correct: 0 },
  { q: "¿Qué intervalo hay entre Do y Mi?", options: ["Segunda", "Tercera", "Cuarta", "Quinta"], correct: 1 },
  { q: "¿Qué significa 'Crescendo'?", options: ["Tocar rápido", "Bajar volumen", "Subir volumen", "Ir al inicio"], correct: 2 },
  { q: "¿Cuál de estos tempos es más rápido?", options: ["Adagio", "Andante", "Allegro", "Presto"], correct: 3 },
  { q: "¿Cuántos semitonos componen una octava?", options: ["8", "10", "12", "14"], correct: 2 },
  { q: "¿Qué nota es la 'A' en cifrado americano?", options: ["Do", "Fa", "Sol", "La"], correct: 3 },
  { q: "¿Qué figura equivale a la mitad de una negra?", options: ["Blanca", "Corchea", "Semicorchea", "Redonda"], correct: 1 },
  { q: "¿Qué acorde forman Do, Mi y Sol?", options: ["Do Menor", "Do Mayor", "Do Aumentado", "Sol Mayor"], correct: 1 },
  { q: "¿Cómo se llama el silencio de 4 tiempos?", options: ["De Negra", "De Blanca", "De Redonda", "De Corchea"], correct: 2 },
  { q: "¿Qué nota está un tono por debajo de Re?", options: ["Do", "Do#", "Si", "Mib"], correct: 0 },
  { q: "¿Qué es un arpegio?", options: ["Notas de acorde tocadas una a una", "Un tipo de guitarra", "Cantar alto", "Silencio largo"], correct: 0 },
  { q: "¿Cuál es la quinta justa de La (A)?", options: ["Re", "Mi", "Fa", "Sol"], correct: 1 },
  { q: "¿Qué indica el número superior de un compás?", options: ["Nota base", "Cantidad de pulsos", "Duración", "Velocidad"], correct: 1 },
  { q: "¿Qué escala tiene la estructura T-T-ST-T-T-T-ST?", options: ["Menor", "Mayor", "Pentatónica", "Dórica"], correct: 1 },
  { q: "¿Qué acorde es relativo menor de Do Mayor?", options: ["La Menor", "Mi Menor", "Re Menor", "Fa Menor"], correct: 0 },
  { q: "¿Qué tipo de compás es un Vals?", options: ["2/4", "3/4", "4/4", "6/8"], correct: 1 },
  { q: "¿Cuántos tonos hay de la primera a la quinta en escala mayor?", options: ["3 y medio", "2 y medio", "4", "3"], correct: 0 },
  { q: "¿Cuál es la nota central (C4) en un piano?", options: ["Do Central", "Mi Central", "La Central", "Re Central"], correct: 0 },
  { q: "¿Qué modo suele sonar triste o melancólico?", options: ["Modo Mayor", "Modo Menor", "Modo Lidio", "Mixolidio"], correct: 1 },
  { q: "¿Qué frecuencia (Hz) afina el La estándar (A4)?", options: ["432 Hz", "440 Hz", "444 Hz", "450 Hz"], correct: 1 },
  { q: "¿Qué escala tiene 5 notas?", options: ["Diatónica", "Pentatónica", "Cromática", "Octatónica"], correct: 1 },
  { q: "¿Qué nota es 'C' en cifrado americano?", options: ["Do", "Si", "La", "Re"], correct: 0 },
  { q: "¿Qué obtenemos si subimos un tono a Fa?", options: ["Sol", "Fa Sostenido", "Mi", "La"], correct: 0 },
  { q: "¿Qué es la armonía?", options: ["El ritmo", "Superposición de acordes", "La melodía sola", "El silencio"], correct: 1 },
  { q: "¿Qué nota es 'F'?", options: ["Sol", "Fa", "Mi", "Si"], correct: 1 },
  { q: "¿Qué es un ostinato?", options: ["Un final", "Patrón musical repetido", "Un grito", "Un error"], correct: 1 },
  { q: "¿Qué nota es 'G'?", options: ["Sol", "La", "Si", "Fa"], correct: 0 },
  { q: "¿Qué es el compás de amalgama?", options: ["4/4", "7/4", "3/4", "2/4"], correct: 1 },
  { q: "¿Qué es una síncopa?", options: ["Acentuar el tiempo débil", "Tocar muy alto", "Bajar el tempo", "Silencio de negra"], correct: 0 },
  { q: "¿Qué nota es la dominante en Do Mayor?", options: ["Fa", "Sol", "La", "Re"], correct: 1 },
  { q: "¿Qué acorde es G7?", options: ["Sol Menor", "Sol Mayor con Séptima Menor", "Sol Aumentado", "Sol Mayor 7"], correct: 1 },
  { q: "¿Cuál es la primera nota de Mi bemol Mayor?", options: ["Re#", "Mib", "Mi", "Fa"], correct: 1 },
  { q: "¿Qué indica la clave de Fa?", options: ["Notas agudas", "Notas graves", "Ritmo", "Volumen"], correct: 1 },
  { q: "¿Qué es un tritono?", options: ["3 notas", "3 tonos exactos", "Un acorde mayor", "Una escala menor"], correct: 1 },
  { q: "¿Qué nota es 'E'?", options: ["Do", "Re", "Mi", "Fa"], correct: 2 },
  { q: "¿Qué es la anacrusa?", options: ["Instrumento griego", "Empezar antes del primer tiempo", "Final brusco", "Coro agudo"], correct: 1 },
  { q: "¿Qué significa 'Pianissimo'?", options: ["Suave", "Muy suave", "Rápido", "Lento"], correct: 1 },
  { q: "¿A qué nota corresponde el 3er espacio del pentagrama (Sol)?", options: ["Si", "Do", "Re", "La"], correct: 1 },
  { q: "¿Qué es un calderón?", options: ["Prolonga la duración de la nota", "Sube el tono", "Silencio", "Instrumento"], correct: 0 },
  { q: "¿Qué es el puente en una canción?", options: ["Final", "Conexión entre estrofa y estribillo", "Inicio", "Solo"], correct: 1 },
  { q: "¿Qué es un acorde menor?", options: ["Alegre", "Triste", "Rápido", "Largo"], correct: 1 },
  { q: "¿Qué es la escala cromática?", options: ["5 notas", "12 semitonos", "7 notas", "8 notas"], correct: 1 },
  { q: "¿Qué nota es 'D'?", options: ["Do", "Re", "Mi", "Fa"], correct: 1 },
  { q: "¿Qué significa BPM?", options: ["Bajos Por Minuto", "Beats Per Minute", "Batería Para Músicos", "Bien Por Mí"], correct: 1 },

  // Instrumentos [50-99]
  { q: "¿Cuántas cuerdas tiene la guitarra clásica?", options: ["4", "5", "6", "7"], correct: 2 },
  { q: "¿Cuál de estos NO es de percusión?", options: ["Cajón", "Xilófono", "Oboe", "Timbal"], correct: 2 },
  { q: "¿Cómo se llama el palito del violín?", options: ["Batuta", "Arco", "Baqueta", "Púa"], correct: 1 },
  { q: "¿Cuántas cuerdas tiene un bajo estándar?", options: ["4", "5", "6", "8"], correct: 0 },
  { q: "¿De qué madera suele ser el diapasón oscuro de la guitarra?", options: ["Pino", "Palo Rosa", "Bambú", "Roble"], correct: 1 },
  { q: "¿Qué platillo doble se abre con el pie?", options: ["Crash", "Ride", "Hi-hat", "Splash"], correct: 2 },
  { q: "¿Cuántas teclas tiene un piano estándar?", options: ["61", "76", "88", "102"], correct: 2 },
  { q: "¿Qué voz femenina es la más aguda?", options: ["Contralto", "Mezzo", "Soprano", "Tenor"], correct: 2 },
  { q: "¿Qué afloja o tensa las cuerdas de guitarra?", options: ["Puente", "Trastes", "Clavijas", "Pastillas"], correct: 2 },
  { q: "¿Qué instrumento da la nota más grave en la orquesta?", options: ["Fagot", "Tuba", "Contrabajo", "Violonchelo"], correct: 2 },
  { q: "¿Qué micro es ideal para grabar voces en estudio?", options: ["Dinámico", "De condensador", "De cinta", "Lavalier"], correct: 1 },
  { q: "¿Afinación estándar de la 6ª cuerda de guitarra?", options: ["Mi", "La", "Re", "Sol"], correct: 0 },
  { q: "¿Qué parte de la batería suena más grave?", options: ["Caja", "Bombo", "Tom base", "Ride"], correct: 1 },
  { q: "¿Qué músculo es vital para el canto?", options: ["Abdomen", "Diafragma", "Laringe", "Tráquea"], correct: 1 },
  { q: "¿Cuántas cuerdas tiene un ukelele?", options: ["4", "5", "6", "8"], correct: 0 },
  { q: "¿Qué capta el sonido en la guitarra eléctrica?", options: ["Mástil", "Clavijero", "Pastillas", "Jack"], correct: 2 },
  { q: "¿Qué técnica de bajo popularizó Flea (RHCP)?", options: ["Tapping", "Slap", "Fingerpicking", "Sweep"], correct: 1 },
  { q: "¿Qué pedal sube y baja frecuencias como una voz?", options: ["Fuzz", "Wah-Wah", "Phaser", "Flanger"], correct: 1 },
  { q: "¿Qué instrumento es de viento-madera pero hecho de metal?", options: ["Trompeta", "Trombón", "Flauta Travesera", "Clarinete"], correct: 2 },
  { q: "¿Cómo se llama tocar dos notas a la vez en guitarra?", options: ["Trémolo", "Bending", "Double Stop", "Slide"], correct: 2 },
  { q: "¿Qué significa 'Pizzicato'?", options: ["Tocar fuerte", "Pellizcar cuerdas frotadas", "Usar arco", "Acordes"], correct: 1 },
  { q: "¿Qué técnica de metal rasga la voz?", options: ["Falsete", "Vibrato", "Growl", "Melisma"], correct: 2 },
  { q: "¿Qué hueso apoya las cuerdas en el clavijero?", options: ["Cejuela", "Puente", "Alma", "Traste cero"], correct: 0 },
  { q: "¿Qué instrumento tocaba Miles Davis?", options: ["Guitarra", "Bajo", "Piano", "Trompeta"], correct: 3 },
  { q: "¿Qué es un metrónomo?", options: ["Afinador", "Marca el pulso", "Efecto", "Llave de batería"], correct: 1 },
  { q: "¿Qué es el 'Vibrato'?", options: ["Subir volumen", "Oscilar altura del sonido", "Tocar rápido", "Silenciar"], correct: 1 },
  { q: "¿Cuántas llaves suele tener un saxo moderno?", options: ["15", "22", "30", "40+"], correct: 1 },
  { q: "¿Cómo se llama la pequeña pieza para tocar guitarra?", options: ["Arco", "Baqueta", "Púa", "Cejilla"], correct: 2 },
  { q: "¿Qué tipo de bajo no tiene trastes?", options: ["Acústico", "Fretless", "Contrabajo", "De 6 cuerdas"], correct: 1 },
  { q: "¿Qué significa 'Glissando'?", options: ["Tocar fuerte", "Deslizar de una nota a otra", "Silencio", "Repetir"], correct: 1 },
  { q: "¿Cómo se llama la técnica de cantar varias notas por sílaba?", options: ["Vibrato", "Melisma", "Falsete", "Belt"], correct: 1 },
  { q: "¿A qué familia pertenece el Saxofón?", options: ["Metal", "Madera", "Percusión", "Cuerda"], correct: 1 },
  { q: "¿Qué instrumento tocaba Ravi Shankar?", options: ["Sitar", "Guitarra", "Arpa", "Violín"], correct: 0 },
  { q: "¿Parte del arco de violín que se sujeta?", options: ["Punta", "Nuez", "Cerdas", "Vara"], correct: 1 },
  { q: "¿Qué instrumento toca Yo-Yo Ma?", options: ["Violín", "Viola", "Violonchelo", "Contrabajo"], correct: 2 },
  { q: "¿Qué parte de la batería da el 'backbeat' en rock?", options: ["Caja", "Tom", "Bombo", "Splash"], correct: 0 },
  { q: "¿Cuántos trastes tiene una eléctrica estándar?", options: ["12-15", "21-24", "28-30", "10-12"], correct: 1 },
  { q: "¿Qué instrumento tocaba Louis Armstrong?", options: ["Saxo", "Trompeta", "Trombón", "Clarinete"], correct: 1 },
  { q: "¿Qué instrumento es un Stradivarius?", options: ["Piano", "Violín", "Guitarra", "Flauta"], correct: 1 },
  { q: "¿Qué es una partitura?", options: ["Instrumento", "Escritura musical", "Concierto", "Músico"], correct: 1 },
  { q: "¿Qué es el timbre?", options: ["Volumen", "Color del sonido", "Altura", "Duración"], correct: 1 },
  { q: "¿Qué instrumento usa sordina?", options: ["Piano", "Trompeta", "Batería", "Guitarra"], correct: 1 },
  { q: "¿Qué es el 'gain' en un ampli?", options: ["Volumen", "Saturación/Distorsión", "Agudos", "Graves"], correct: 1 },
  { q: "¿Qué es un riff?", options: ["Un error", "Frase pegadiza de guitarra", "Platillo", "Cantante"], correct: 1 },
  { q: "¿Qué madera es común en el cuerpo de guitarras acústicas?", options: ["Ébano", "Pino", "Caoba/Abeto", "Bambú"], correct: 2 },
  { q: "¿Qué micrófono no necesita alimentación extra (Phantom)?", options: ["Condensador", "Dinámico", "De válvula", "De cinta"], correct: 1 },
  { q: "¿Qué es el 'Palm Mute'?", options: ["Mutear con la palma de la mano", "Afinar", "Cambiar pastillas", "Romper la púa"], correct: 0 },
  { q: "¿Qué batería tiene los parches de malla?", options: ["Acústica", "Electrónica", "Sinfónica", "Timbales"], correct: 1 },
  { q: "¿Qué pedal duplica tu sonido como si hubiera otra guitarra?", options: ["Distorsión", "Chorus", "Wah", "Compresor"], correct: 1 },

  // Cultura General e Historia [100-149]
  { q: "¿Quién compuso 'Las cuatro estaciones'?", options: ["Mozart", "Beethoven", "Vivaldi", "Bach"], correct: 2 },
  { q: "¿Qué instrumento tocaba Jimi Hendrix?", options: ["Bajo", "Batería", "Teclado", "Guitarra"], correct: 3 },
  { q: "¿Qué estilo tiene ritmo 'swing' y mucha improvisación?", options: ["Reggae", "Jazz", "Metal", "Cumbia"], correct: 1 },
  { q: "¿Qué significa 'A cappella'?", options: ["Agudo", "Sin instrumentos", "En latín", "Rápido"], correct: 1 },
  { q: "¿Quién es el 'Rey del Pop'?", options: ["Elvis", "Prince", "Michael Jackson", "Freddie Mercury"], correct: 2 },
  { q: "¿Qué banda cruzó el paso de Abbey Road?", options: ["Stones", "The Who", "The Beatles", "Pink Floyd"], correct: 2 },
  { q: "¿Qué compositor se quedó sordo?", options: ["Beethoven", "Chopin", "Tchaikovsky", "Wagner"], correct: 0 },
  { q: "¿De dónde es el Flamenco?", options: ["Argentina", "México", "España", "Cuba"], correct: 2 },
  { q: "¿Qué banda lideraba Freddie Mercury?", options: ["AC/DC", "Queen", "Nirvana", "Guns N' Roses"], correct: 1 },
  { q: "¿Cuándo fue el festival de Woodstock original?", options: ["1950s", "1960s (1969)", "1970s", "1980s"], correct: 1 },
  { q: "¿Qué estilo popularizó Bob Marley?", options: ["Salsa", "Jazz", "Reggae", "Bossa Nova"], correct: 2 },
  { q: "¿Vocalista de The Doors?", options: ["Jim Morrison", "Mick Jagger", "Robert Plant", "Kurt Cobain"], correct: 0 },
  { q: "¿De qué ciudad son The Beatles?", options: ["Londres", "Manchester", "Liverpool", "Birmingham"], correct: 2 },
  { q: "¿Quién es 'La Reina del Soul'?", options: ["Whitney Houston", "Aretha Franklin", "Tina Turner", "Diana Ross"], correct: 1 },
  { q: "¿Dónde nació el Jazz?", options: ["Inglaterra", "Francia", "Estados Unidos", "Brasil"], correct: 2 },
  { q: "¿Qué guitarrista tocaba en Led Zeppelin?", options: ["Clapton", "Jimmy Page", "Keith Richards", "Slash"], correct: 1 },
  { q: "¿Autor de BSO de 'Star Wars' y 'Jurassic Park'?", options: ["Zimmer", "John Williams", "Morricone", "Elfman"], correct: 1 },
  { q: "¿Quién canta 'Thriller'?", options: ["Prince", "Stevie Wonder", "Michael Jackson", "George Michael"], correct: 2 },
  { q: "¿Qué estilo es famoso en Nueva Orleans?", options: ["Country", "Jazz", "Grunge", "Punk"], correct: 1 },
  { q: "¿Qué instrumento toca Carlos Santana?", options: ["Guitarra", "Batería", "Piano", "Bajo"], correct: 0 },
  { q: "¿Fabricante de la 'Stratocaster'?", options: ["Gibson", "Ibanez", "Fender", "PRS"], correct: 2 },
  { q: "¿Baterista de The Who que destruía su set?", options: ["John Bonham", "Ringo Starr", "Keith Moon", "Neil Peart"], correct: 2 },
  { q: "¿Compositor del Himno de la Alegría?", options: ["Mozart", "Beethoven", "Brahms", "Wagner"], correct: 1 },
  { q: "¿Banda de Kurt Cobain?", options: ["Pearl Jam", "Alice in Chains", "Nirvana", "Soundgarden"], correct: 2 },
  { q: "¿Estilo de los 70 nacido como rebelión al rock progresivo?", options: ["Disco", "Punk", "Metal", "New Wave"], correct: 1 },
  { q: "¿Quién tocaba el bajo en los Beatles?", options: ["Lennon", "Harrison", "Starr", "McCartney"], correct: 3 },
  { q: "¿Ritmo base del Reggaetón?", options: ["Dem Bow", "Tumbao", "Clave", "Swing"], correct: 0 },
  { q: "¿Quién es 'The Boss'?", options: ["Bruce Springsteen", "Elvis Presley", "Frank Sinatra", "David Bowie"], correct: 0 },
  { q: "¿Banda del disco 'The Dark Side of the Moon'?", options: ["The Doors", "Pink Floyd", "The Clash", "Led Zeppelin"], correct: 1 },
  { q: "¿Compositor de la 'Marcha Turca'?", options: ["Beethoven", "Chopin", "Mozart", "Tchaikovsky"], correct: 2 },
  { q: "¿Cantante protagonista de 'El Guardaespaldas'?", options: ["Mariah Carey", "Celine Dion", "Whitney Houston", "Tina Turner"], correct: 2 },
  { q: "¿Banda de 'Smells Like Teen Spirit'?", options: ["Oasis", "Nirvana", "Green Day", "Radiohead"], correct: 1 },
  { q: "¿País de la 'Bossa Nova'?", options: ["México", "España", "Brasil", "Perú"], correct: 2 },
  { q: "¿Director de orquesta?", options: ["Compositor", "Maestro", "Concertino", "Arreglista"], correct: 1 },
  { q: "¿Instrumento de Paco de Lucía?", options: ["Bajo", "Batería", "Piano", "Guitarra"], correct: 3 },
  { q: "¿Banda de Chris Martin?", options: ["Keane", "Coldplay", "Muse", "Arctic Monkeys"], correct: 1 },
  { q: "¿Autor de 'Rocket Man'?", options: ["Elton John", "Billy Joel", "McCartney", "Bowie"], correct: 0 },
  { q: "¿Género nacido en el Bronx en los 70?", options: ["Rock", "Techno", "Hip Hop", "Salsa"], correct: 2 },
  { q: "¿Guitarra que usa Angus Young (AC/DC)?", options: ["Stratocaster", "Gibson SG", "Les Paul", "Ibanez"], correct: 1 },
  { q: "¿Canta 'Like a Prayer'?", options: ["Madonna", "Aretha", "Whitney", "Cher"], correct: 0 },
  { q: "¿Artista ciego desde niño?", options: ["Ray Charles", "Stevie Wonder", "Andrea Bocelli", "Todos ellos"], correct: 3 },
  { q: "¿Compositor barroco con 20 hijos?", options: ["Vivaldi", "Bach", "Mozart", "Händel"], correct: 1 },
  { q: "¿Compositor de sistema dodecafónico?", options: ["Schoenberg", "Stravinsky", "Debussy", "Ravel"], correct: 0 },
  { q: "¿Bajista de Iron Maiden?", options: ["Steve Harris", "Lemmy", "Cliff Burton", "Geezer"], correct: 0 },
  { q: "¿Banda de 'Stairway to Heaven'?", options: ["Pink Floyd", "Led Zeppelin", "Deep Purple", "The Doors"], correct: 1 },
  { q: "¿Autor de 'El Mesías'?", options: ["Bach", "Händel", "Vivaldi", "Telemann"], correct: 1 },
  { q: "¿Banda del álbum 'Nevermind'?", options: ["Pearl Jam", "Nirvana", "Soundgarden", "Alice"], correct: 1 },
  { q: "¿Quién canta 'Purple Rain'?", options: ["Michael Jackson", "Prince", "David Bowie", "Madonna"], correct: 1 },
  { q: "¿Rey del Blues?", options: ["B.B. King", "Muddy Waters", "Robert Johnson", "Buddy Guy"], correct: 0 },
  { q: "¿Compositor de 'El lago de los cisnes'?", options: ["Tchaikovsky", "Stravinsky", "Prokofiev", "Glinka"], correct: 0 },
  // --- [151-200] TEORÍA MUSICAL AVANZADA Y LENGUAJE ---
  { q: "¿Qué figura musical representa un tercio de un pulso en un compás simple?", options: ["Semicorchea", "Tresillo", "Corchea con puntillo", "Fusa"], correct: 1 },
  { q: "¿Qué significa 'Da Capo' (D.C.) en una partitura?", options: ["Subir el volumen", "Terminar la canción", "Volver al principio", "Ir al estribillo"], correct: 2 },
  { q: "¿Qué término indica que se debe ir disminuyendo la velocidad poco a poco?", options: ["Crescendo", "Ritardando", "Staccato", "A tempo"], correct: 1 },
  { q: "¿Cómo se llama la nota que da nombre a una escala (el Grado I)?", options: ["Dominante", "Sensible", "Tónica", "Subdominante"], correct: 2 },
  { q: "¿Qué grado de la escala es la 'Dominante'?", options: ["El tercero (III)", "El cuarto (IV)", "El quinto (V)", "El séptimo (VII)"], correct: 2 },
  { q: "¿Cuál es la armadura que tiene un solo sostenido (Fa#)?", options: ["Do Mayor", "Sol Mayor", "Re Mayor", "Fa Mayor"], correct: 1 },
  { q: "¿Qué símbolo anula el efecto de un sostenido o un bemol?", options: ["El doble sostenido", "El calderón", "La ligadura", "El becuadro"], correct: 3 },
  { q: "¿Qué intervalo hay de Do a Sol?", options: ["Tercera", "Cuarta", "Quinta", "Sexta"], correct: 2 },
  { q: "¿Cómo se llama el acorde formado por cuatro notas (añadiendo la séptima)?", options: ["Tríada", "Cuatríada", "Quinta vacía", "Acorde de paso"], correct: 1 },
  { q: "¿Qué estilo musical usa intensamente la polirritmia (varios ritmos a la vez)?", options: ["Pop", "Música clásica europea", "Música tradicional africana", "Country"], correct: 2 },
  { q: "¿Qué es un arpegio?", options: ["Tocar un acorde nota por nota", "Tocar muy rápido", "Un error de afinación", "Un silencio largo"], correct: 0 },
  { q: "¿Qué significa 'Staccato'?", options: ["Tocar notas muy ligadas", "Tocar notas cortas y separadas", "Subir el tono", "Bajar el volumen"], correct: 1 },
  { q: "¿Qué clave se utiliza para los sonidos más agudos?", options: ["Clave de Fa", "Clave de Sol", "Clave de Do en 3ª", "Clave de Do en 4ª"], correct: 1 },
  { q: "¿Qué indica la ligadura de prolongación?", options: ["Suma la duración de dos notas iguales", "Se debe respirar", "Se toca más fuerte", "Termina la frase"], correct: 0 },
  { q: "¿Qué es la 'Sensible' en una escala mayor?", options: ["El 1er grado", "El 3er grado", "El 5º grado", "El 7º grado"], correct: 3 },
  { q: "¿Cuántas semicorcheas caben en una nota Blanca?", options: ["4", "8", "16", "32"], correct: 1 },
  { q: "¿Qué es el 'Tempo'?", options: ["El volumen", "El carácter", "La velocidad de la música", "El instrumento"], correct: 2 },
  { q: "¿Qué acorde es relativo menor de Sol Mayor?", options: ["Mi Menor", "La Menor", "Si Menor", "Do Menor"], correct: 0 },
  { q: "¿Qué figura es la más larga de las siguientes?", options: ["Blanca", "Redonda", "Cuadrada", "Breve"], correct: 1 }, // Históricamente hay mayores, pero redonda en actual.
  { q: "¿Qué significa 'Atonalidad'?", options: ["Cantar afinado", "Música sin un centro tonal definido", "Un coro sin voces", "Tocar muy grave"], correct: 1 },
  { q: "¿Qué compás es 2/4?", options: ["Binario", "Ternario", "Cuaternario", "Irregular"], correct: 0 },
  { q: "¿Qué distancia hay entre Mi y Fa natural?", options: ["Un tono", "Un semitono", "Dos tonos", "Ninguna"], correct: 1 },
  { q: "¿Cómo se llama el silencio que dura lo mismo que una figura de un tiempo?", options: ["Silencio de redonda", "Silencio de negra", "Silencio de corchea", "Silencio de blanca"], correct: 1 },
  { q: "¿Qué nota obtenemos si bajamos medio tono a un Si natural?", options: ["Do", "La", "Sib (Si bemol)", "Si# (Si sostenido)"], correct: 2 },
  { q: "¿Qué es la dinámica en música?", options: ["La velocidad", "El grado de intensidad o volumen", "La afinación", "El estilo"], correct: 1 },
  { q: "¿Qué significa D.S. al Coda?", options: ["Terminar ya", "Repetir desde el estribillo", "Desde el signo (Segno) hasta la Coda", "Tocar más fuerte"], correct: 2 },
  { q: "¿Qué acorde se forma con Re, Fa# y La?", options: ["Re Menor", "Re Mayor", "Re Aumentado", "Re Disminuido"], correct: 1 },
  { q: "¿Cuál es la nota más aguda de las siguientes?", options: ["C2", "C3", "C4", "C5"], correct: 3 },
  { q: "¿Qué es un 'BPM'?", options: ["Golpes por minuto", "Bajos por minuto", "Bandas por mes", "Buena pulsación musical"], correct: 0 },
  { q: "¿Qué significa 'A tempo'?", options: ["Tocar más rápido", "Volver a la velocidad original", "Hacer una pausa", "Tocar en silencio"], correct: 1 },
  { q: "¿Qué intervalo hay de Sol a Do?", options: ["Segunda", "Tercera", "Cuarta", "Quinta"], correct: 2 },
  { q: "¿Qué es un 'Mordente'?", options: ["Un adorno musical rápido", "Un tipo de afinador", "Una púa rota", "Un acorde triste"], correct: 0 },
  { q: "¿Qué estructura tiene una escala mayor?", options: ["T-ST-T-T-ST-T-T", "T-T-ST-T-T-T-ST", "ST-T-T-T-ST-T-T", "T-T-T-ST-T-T-ST"], correct: 1 },
  { q: "¿Qué nota es equivalente enarmónicamente a Do#?", options: ["Reb", "Mib", "Si#", "Fab"], correct: 0 },
  { q: "¿Qué tipo de acorde es Do-Mib-Sol?", options: ["Mayor", "Aumentado", "Disminuido", "Menor"], correct: 3 },
  { q: "¿Qué es una síncopa?", options: ["Acentuar una parte débil del compás", "Tocar sin ritmo", "Desmayarse cantando", "Un efecto de guitarra"], correct: 0 },
  { q: "¿Qué indican dos barras verticales al final de un pentagrama?", options: ["Sube el volumen", "Repetición", "Final de la pieza", "Cambio de clave"], correct: 2 },
  { q: "¿Cuál es la distancia de una octava?", options: ["5 tonos", "6 tonos", "7 tonos", "8 tonos"], correct: 1 },
  { q: "¿Qué es la 'Clave' en percusión latina?", options: ["Un cantante", "Un ritmo base de 5 golpes", "Un piano", "Un bajo"], correct: 1 },
  { q: "¿Qué figura tiene un corchete (rabito)?", options: ["Negra", "Corchea", "Semicorchea", "Blanca"], correct: 1 },
  { q: "¿Cuántos bemoles tiene la armadura de Fa Mayor?", options: ["0", "1", "2", "3"], correct: 1 },
  { q: "¿Qué grado es la subdominante?", options: ["I", "II", "IV", "V"], correct: 2 },
  { q: "¿Qué intervalo forma la 'quinta del lobo' o tritono?", options: ["Quinta justa", "Cuarta aumentada / Quinta disminuida", "Sexta menor", "Tercera mayor"], correct: 1 },
  { q: "¿Qué indica la palabra 'Ritardando'?", options: ["Más volumen", "Menos volumen", "Más velocidad", "Menos velocidad progresivamente"], correct: 3 },
  { q: "¿Qué es el cifrado americano?", options: ["Un código secreto", "Usar letras de la A a la G para las notas", "Una técnica vocal", "Un ritmo de batería"], correct: 1 },
  { q: "¿Qué nota corresponde a la letra 'E'?", options: ["Do", "Re", "Mi", "Fa"], correct: 2 },
  { q: "¿Qué compás tiene 3 tiempos de negra?", options: ["2/4", "3/4", "4/4", "6/8"], correct: 1 },
  { q: "¿Qué es el 'Pitch'?", options: ["El volumen", "El ritmo", "La altura o tono de una nota", "El instrumento"], correct: 2 },
  { q: "¿Qué instrumento lee en clave de Do en 3ª línea?", options: ["Violín", "Viola", "Violonchelo", "Contrabajo"], correct: 1 },
  { q: "¿Cuál de estos acordes es una tríada mayor?", options: ["Do-Mi-Sol", "Do-Mib-Sol", "Do-Mi-Sol#", "Do-Mib-Solb"], correct: 0 },

  // --- [201-250] HISTORIA DEL ROCK, POP, INDIE Y METAL ---
  { q: "¿De qué ciudad son originarios los hermanos Gallagher (Oasis)?", options: ["Londres", "Liverpool", "Manchester", "Glasgow"], correct: 2 },
  { q: "¿Cómo se llama el icónico álbum de Nirvana con un bebé en la portada?", options: ["In Utero", "Bleach", "Nevermind", "MTV Unplugged"], correct: 2 },
  { q: "¿Quién compuso y cantó 'Space Oddity'?", options: ["Elton John", "Freddie Mercury", "David Bowie", "Mick Jagger"], correct: 2 },
  { q: "¿Qué banda lanzó el álbum 'Appetite for Destruction'?", options: ["Aerosmith", "Mötley Crüe", "Guns N' Roses", "Def Leppard"], correct: 2 },
  { q: "¿Quién cantaba 'Superstition' y 'Isn't She Lovely'?", options: ["Ray Charles", "Stevie Wonder", "James Brown", "Marvin Gaye"], correct: 1 },
  { q: "¿Cómo se llama el cantante de U2?", options: ["Sting", "Bono", "The Edge", "Bruce Springsteen"], correct: 1 },
  { q: "¿De qué banda fue vocalista Thom Yorke?", options: ["Coldplay", "Blur", "Radiohead", "Muse"], correct: 2 },
  { q: "¿En qué año fue asesinado John Lennon?", options: ["1970", "1975", "1980", "1985"], correct: 2 },
  { q: "¿Quién tocó el himno de EE.UU. con su guitarra en Woodstock '69?", options: ["Eric Clapton", "Carlos Santana", "Jimi Hendrix", "Pete Townshend"], correct: 2 },
  { q: "¿Qué banda toca la famosa canción 'Hotel California'?", options: ["The Byrds", "The Eagles", "The Beach Boys", "The Doors"], correct: 1 },
  { q: "¿Cómo se llamaba el baterista de Metallica desde sus inicios?", options: ["Lars Ulrich", "Dave Grohl", "Tommy Lee", "Joey Jordison"], correct: 0 },
  { q: "¿Cuál es el nombre real de Elton John?", options: ["Reginald Kenneth Dwight", "John Roy", "Elton B. Smith", "Arthur John"], correct: 0 },
  { q: "¿De dónde es originaria la cantante Björk?", options: ["Suecia", "Noruega", "Islandia", "Dinamarca"], correct: 2 },
  { q: "¿Qué banda es famosa por pioneros de la música electrónica con el álbum 'Autobahn'?", options: ["Depeche Mode", "Daft Punk", "Kraftwerk", "New Order"], correct: 2 },
  { q: "¿Quién cantaba 'Losing My Religion'?", options: ["R.E.M.", "U2", "The Cure", "The Smiths"], correct: 0 },
  { q: "¿Qué banda lideraba el cantante Morrissey?", options: ["Joy Division", "The Smiths", "The Cure", "Depeche Mode"], correct: 1 },
  { q: "¿Cómo se llama el guitarrista de los Red Hot Chili Peppers (más icónico)?", options: ["John Frusciante", "Dave Navarro", "Flea", "Chad Smith"], correct: 0 },
  { q: "¿Qué banda sacó el álbum 'Rumours' en 1977?", options: ["Fleetwood Mac", "The Eagles", "ABBA", "Queen"], correct: 0 },
  { q: "¿Cuál es el nombre real de Freddie Mercury?", options: ["Frederick Bulsara", "Farrokh Bulsara", "Fred Mercury", "Faisal Bulsara"], correct: 1 },
  { q: "¿Qué banda compuso 'Under the Bridge'?", options: ["Nirvana", "Red Hot Chili Peppers", "Pearl Jam", "Foo Fighters"], correct: 1 },
  { q: "¿Quién compuso la canción 'Creep'?", options: ["Oasis", "Blur", "Radiohead", "Pulp"], correct: 2 },
  { q: "¿Quién cantaba 'Sweet Child O' Mine'?", options: ["Axl Rose", "Jon Bon Jovi", "Steven Tyler", "Sebastian Bach"], correct: 0 },
  { q: "¿Cuál fue el primer sencillo de The Beatles?", options: ["Help!", "Hey Jude", "Love Me Do", "Love Me Do"], correct: 3 }, // Love Me Do
  { q: "¿Qué cantante inventó el paso de baile 'Moonwalk'?", options: ["James Brown", "Prince", "Michael Jackson", "Usher"], correct: 2 },
  { q: "¿Quién es el vocalista de Arctic Monkeys?", options: ["Alex Turner", "Julian Casablancas", "Damon Albarn", "Liam Gallagher"], correct: 0 },
  { q: "¿Qué banda virtual fue creada por Damon Albarn?", options: ["Daft Punk", "Gorillaz", "The Strokes", "Blur"], correct: 1 },
  { q: "¿Quién cantaba 'Livin' on a Prayer'?", options: ["Aerosmith", "Guns N' Roses", "Bon Jovi", "Europe"], correct: 2 },
  { q: "¿En qué década nació el movimiento Punk?", options: ["1950s", "1960s", "1970s", "1990s"], correct: 2 },
  { q: "¿De qué banda fue vocalista Robert Plant?", options: ["The Rolling Stones", "The Who", "Led Zeppelin", "Black Sabbath"], correct: 2 },
  { q: "¿Qué banda es famosa por usar maquillaje blanco y negro (The Demon, Starchild...)?", options: ["Slipknot", "KISS", "Misfits", "Ghost"], correct: 1 },
  { q: "¿Quién era la voz principal de The Police?", options: ["Bono", "Sting", "Phil Collins", "Peter Gabriel"], correct: 1 },
  { q: "¿Qué banda británica está formada por los hermanos Angus y Malcolm Young?", options: ["AC/DC", "Def Leppard", "Judas Priest", "Motörhead"], correct: 0 }, // AC/DC es australiana, pero origen británico/escocés. Pregunta común.
  { q: "¿Quién canta 'Back to Black'?", options: ["Lady Gaga", "Amy Winehouse", "Adele", "Sia"], correct: 1 },
  { q: "¿Cómo se llama el festival mundial benéfico que organizó Bob Geldof en 1985?", options: ["Woodstock", "Coachella", "Live Aid", "Glastonbury"], correct: 2 },
  { q: "¿Qué banda canta 'Don't Stop Believin''?", options: ["Journey", "Queen", "Toto", "Boston"], correct: 0 },
  { q: "¿Qué rapero protagonizó la película '8 Mile'?", options: ["Tupac", "Snoop Dogg", "Eminem", "Dr. Dre"], correct: 2 },
  { q: "¿Qué artista femenina canta 'Wrecking Ball'?", options: ["Taylor Swift", "Miley Cyrus", "Katy Perry", "Ariana Grande"], correct: 1 },
  { q: "¿Qué banda popularizó el tema 'Karma Chameleon'?", options: ["Culture Club", "Duran Duran", "Spandau Ballet", "Tears for Fears"], correct: 0 },
  { q: "¿De qué país es originaria la banda Rammstein?", options: ["Alemania", "Suecia", "Finlandia", "Noruega"], correct: 0 },
  { q: "¿Qué cantante pop es conocida como 'La Reina del Pop'?", options: ["Whitney Houston", "Madonna", "Britney Spears", "Lady Gaga"], correct: 1 },
  { q: "¿Quién fue el vocalista de Linkin Park?", options: ["Chris Cornell", "Chester Bennington", "Scott Weiland", "Layne Staley"], correct: 1 },
  { q: "¿Qué banda lidera Dave Grohl tras la muerte de Kurt Cobain?", options: ["Audioslave", "Queens of the Stone Age", "Foo Fighters", "Tenacious D"], correct: 2 },
  { q: "¿Qué legendario guitarrista tiene el apodo 'Slowhand' (Mano lenta)?", options: ["Jeff Beck", "Eric Clapton", "Mark Knopfler", "David Gilmour"], correct: 1 },
  { q: "¿Qué banda lanzó el álbum 'Master of Puppets'?", options: ["Megadeth", "Slayer", "Metallica", "Anthrax"], correct: 2 },
  { q: "¿Qué canción de Luis Fonsi rompió todos los récords de YouTube en 2017?", options: ["Bailando", "Despacito", "Mi Gente", "Danza Kuduro"], correct: 1 },
  { q: "¿Quién era la voz de The Cranberries?", options: ["Sinead O'Connor", "Dolores O'Riordan", "Shirley Manson", "Gwen Stefani"], correct: 1 },
  { q: "¿Qué grupo español cantaba 'Entre dos tierras'?", options: ["Estopa", "Mecano", "Héroes del Silencio", "Los Del Río"], correct: 2 }, // Paco de Lucía, pero en banda pop/rock es Héroes
  { q: "¿Cómo se llama el líder de la banda The Cure?", options: ["Ian Curtis", "Robert Smith", "Simon Le Bon", "Martin Gore"], correct: 1 },
  { q: "¿Qué cantante femenina rompió récords con 'I Will Always Love You'?", options: ["Celine Dion", "Whitney Houston", "Mariah Carey", "Aretha Franklin"], correct: 1 },
  { q: "¿Qué famoso rapero fue asesinado en Las Vegas en 1996?", options: ["Notorious B.I.G.", "Eazy-E", "Tupac Shakur", "Mac Miller"], correct: 2 },

  // --- [251-300] INSTRUMENTOS, LUTHERÍA, ESTUDIO Y PRODUCCIÓN ---
  { q: "¿Qué es un Luthier?", options: ["Un tipo de violín", "Un artesano que construye/repara instrumentos", "Un efecto de voz", "Un cantante de ópera"], correct: 1 },
  { q: "¿Qué madera se usa típicamente para la tapa armónica de las guitarras acústicas?", options: ["Abeto", "Ébano", "Caoba", "Pino"], correct: 0 },
  { q: "¿Qué significan las siglas DAW en producción musical?", options: ["Digital Audio Workstation", "Direct Audio Wave", "Digital Acoustic Wave", "Dual Audio Window"], correct: 0 },
  { q: "¿Cuál de estos es un programa DAW?", options: ["Photoshop", "Excel", "Ableton Live", "AutoCAD"], correct: 2 },
  { q: "¿Qué es la 'Latencia' al grabar audio?", options: ["El volumen máximo", "El retraso de tiempo desde que tocas hasta que suena", "El eco", "La afinación"], correct: 1 },
  { q: "¿Qué es un cable XLR?", options: ["Cable de carga USB", "Cable de vídeo", "Cable balanceado típico de micrófono", "Cable de altavoz pasivo"], correct: 2 },
  { q: "¿Qué es el 'Phantom Power' (+48V)?", options: ["Energía para micros de condensador", "Un pedal de distorsión", "Un amplificador de 48 vatios", "Una marca de guitarras"], correct: 0 },
  { q: "¿Para qué sirve un 'Compresor' de audio?", options: ["Afinar la voz", "Igualar los picos de volumen (rango dinámico)", "Añadir eco", "Cambiar el formato a MP3"], correct: 1 },
  { q: "¿Qué hace la 'Ecualización' (EQ)?", options: ["Sube el volumen general", "Corta o realza frecuencias específicas (graves/agudos)", "Añade coros", "Elimina el ruido de fondo"], correct: 1 },
  { q: "¿Cuál es el rango de frecuencias que el oído humano joven puede escuchar?", options: ["0 Hz - 10 kHz", "20 Hz - 20 kHz", "100 Hz - 50 kHz", "50 Hz - 100 kHz"], correct: 1 },
  { q: "¿Qué diferencia a un micrófono dinámico de uno de condensador?", options: ["Es más sensible y frágil", "Es más robusto y soporta más volumen sin distorsionar", "Necesita electricidad extra", "Solo graba graves"], correct: 1 },
  { q: "¿Qué es un micrófono con patrón 'Cardioide'?", options: ["Capta el sonido en forma de corazón (frontal)", "Capta en 360 grados", "Capta solo los latidos del corazón", "No capta sonido"], correct: 0 },
  { q: "¿Qué significa MIDI?", options: ["Music In Digital Internet", "Musical Instrument Digital Interface", "Mini Input Data Interface", "Microphone Input Direct"], correct: 1 },
  { q: "¿Qué es la 'Reverb' (Reverberación)?", options: ["Un eco lejano", "La persistencia del sonido en un espacio cerrado", "Un cambio de tono", "Un fallo del cable"], correct: 1 },
  { q: "¿Para qué sirve una 'Interfaz de Audio' o Tarjeta de Sonido?", options: ["Para escuchar música en Spotify", "Para convertir el sonido analógico en digital hacia el PC", "Para afinar la guitarra", "Para encender el PC"], correct: 1 },
  { q: "¿Qué es el 'Master' en un estudio de grabación?", options: ["El director del estudio", "El canal de salida principal donde se mezcla todo", "El disco duro", "Un instrumento"], correct: 1 },
  { q: "¿Qué son los 'Monitores de estudio'?", options: ["Las pantallas de ordenador", "Altavoces planos que no colorean el sonido", "Cámaras de vigilancia", "Auriculares Bluetooth"], correct: 1 },
  { q: "¿Qué es un archivo WAV?", options: ["Un vídeo comprimido", "Un formato de audio sin compresión (alta calidad)", "Un formato de audio muy ligero", "Una partitura digital"], correct: 1 },
  { q: "¿Qué es el MP3?", options: ["Un formato de audio comprimido con pérdida de calidad", "Un formato de vídeo", "Un instrumento", "Un cable"], correct: 0 },
  { q: "¿Qué es un teclado controlador MIDI?", options: ["Un teclado que tiene altavoces propios", "Un teclado que solo envía datos al PC, sin sonido propio", "Un piano de cola", "Un sintetizador analógico"], correct: 1 },
  { q: "¿Qué es el 'Feedback' o Acople?", options: ["Cuando el público aplaude", "El pitido cuando un micro capta el sonido de su propio altavoz", "Un efecto de eco", "Un error del PC"], correct: 1 },
  { q: "¿Cómo se llama el tubo de metal o cristal que usan los guitarristas en el dedo?", options: ["Slide (o Bottleneck)", "Cejilla", "Púa", "Traste"], correct: 0 },
  { q: "¿Qué es una pastilla 'Humbucker'?", options: ["Una pastilla simple", "Una pastilla de guitarra doble que cancela el ruido eléctrico", "Una batería", "Un pedal de bajo"], correct: 1 },
  { q: "¿Qué es un bajo 'activo'?", options: ["Uno que se mueve mucho", "Uno que necesita una pila (preamplificador interno)", "Uno sin trastes", "Uno de 6 cuerdas"], correct: 1 },
  { q: "¿Qué es un 'Rack' de batería?", options: ["Las baquetas", "Una estructura metálica para colgar los tambores y platos", "La alfombra", "El asiento del baterista"], correct: 1 },
  { q: "¿Qué marca de platillos de batería es de las más antiguas y famosas del mundo?", options: ["Fender", "Zildjian", "Yamaha", "Roland"], correct: 1 },
  { q: "¿Qué son las 'escobillas' en batería?", options: ["Para limpiar los platos", "Baquetas de hilos de metal/plástico para tocar suave (Jazz)", "Un tipo de pedal", "Un soporte"], correct: 1 },
  { q: "¿Cuántos pedales suele tener un arpa sinfónica moderna?", options: ["0", "3", "5", "7"], correct: 3 },
  { q: "¿Cómo se llaman las cuerdas de la viola de agudo a grave?", options: ["Mi, La, Re, Sol", "La, Re, Sol, Do", "Sol, Re, La, Mi", "Do, Sol, Re, La"], correct: 1 },
  { q: "¿Cómo se llama el instrumento de viento madera más pequeño y agudo de la orquesta?", options: ["Oboe", "Clarinete", "Flautín (Piccolo)", "Fagot"], correct: 2 },
  { q: "¿Qué efecto es el 'Flanger'?", options: ["Un filtro que suena como el motor de un avión a reacción", "Un eco infinito", "Una distorsión sucia", "Un cambio de afinación"], correct: 0 },
  { q: "¿Qué es el Auto-Tune?", options: ["Un robot que canta", "Un software que corrige la afinación de la voz automáticamente", "Un amplificador de guitarra", "Un micrófono"], correct: 1 },
  { q: "¿Qué es el 'Clipping' o picar en rojo?", options: ["Saturación digital destructiva porque la señal entra muy fuerte", "Cortar un trozo de audio", "Un ritmo latino", "Una púa especial"], correct: 0 },
  { q: "¿Cómo se llama el palo usado para tocar el violonchelo?", options: ["Baqueta", "Maza", "Arco", "Vara"], correct: 2 },
  { q: "¿Qué es la 'Cejilla' o 'Capotraste'?", options: ["La cabeza del mástil", "Un accesorio para acortar las cuerdas y subir el tono", "Una pastilla", "Un cable"], correct: 1 },
  { q: "¿Qué es el 'Truss rod' o Alma de la guitarra?", options: ["El puente", "La varilla metálica dentro del mástil para ajustar su curvatura", "Las clavijas", "El barniz"], correct: 1 },
  { q: "¿Qué es un puente flotante (Ej: Floyd Rose)?", options: ["Un puente que permite mover la palanca hacia arriba y hacia abajo", "Un puente de madera", "Un puente que se quita fácil", "Un tipo de afinador"], correct: 0 },
  { q: "¿Qué significa 'Afinación Drop D' en guitarra?", options: ["Afinar todas las cuerdas un tono abajo", "Bajar la 6ª cuerda (Mi) un tono entero hasta Re", "Subir la 1ª cuerda", "Afinar al revés"], correct: 1 },
  { q: "¿Qué es un cable 'Speakon'?", options: ["Un cable de guitarra estándar", "Un cable de gran potencia para conectar amplificadores a altavoces", "Un cable USB", "Un cable MIDI"], correct: 1 },
  { q: "¿Qué significa 'Bypass' en un pedal de efecto?", options: ["Que el pedal está roto", "Que la señal de audio pasa limpia sin ser afectada por el pedal", "Que suena el doble de fuerte", "Que hace eco"], correct: 1 },
  { q: "¿Qué parte de la baqueta golpea el parche?", options: ["El cuello", "El cuerpo", "La bellota o punta", "La base"], correct: 2 },
  { q: "¿Qué es la 'Frecuencia de Muestreo' estándar de un CD de audio?", options: ["44.1 kHz", "48 kHz", "96 kHz", "192 kHz"], correct: 0 },
  { q: "¿Qué es el 'Overdubbing'?", options: ["Cantar muy alto", "Grabar una capa de audio nueva sobre otra ya existente", "Borrar la pista", "Bajar el volumen"], correct: 1 },
  { q: "¿Qué es el 'Tapping'?", options: ["Bailar claqué", "Tocar el piano", "Pulsar las cuerdas de la guitarra con los dedos de la mano derecha (sin púa)", "Afilar la púa"], correct: 2 },
  { q: "¿Qué instrumento rítmico consiste en un cajón de madera sobre el que uno se sienta?", options: ["Bongó", "Conga", "Cajón flamenco", "Timbal"], correct: 2 },
  { q: "¿Qué instrumento es el 'Fagot'?", options: ["Un tambor gigante", "Un viento-madera de registro grave", "Una trompeta pequeña", "Un teclado"], correct: 1 },
  { q: "¿Qué es un 'Pad' en producción musical?", options: ["Un sonido sintetizado atmosférico y sostenido de fondo", "Un golpe seco", "Un silencio", "Una guitarra acústica"], correct: 0 },
  { q: "¿Cómo se llama la persona que diseña los sonidos y efectos en una película?", options: ["Compositor", "Diseñador de sonido / Foley", "Director", "Productor ejecutivo"], correct: 1 },
  { q: "¿Qué empresa japonesa creó el mítico sintetizador DX7 y fabrica pianos y motos?", options: ["Korg", "Roland", "Yamaha", "Kawai"], correct: 2 },
  { q: "¿Qué plataforma revolucionó la música en los 2000 al popularizar las descargas P2P?", options: ["Spotify", "Apple Music", "Napster", "YouTube"], correct: 2 },
// --- [301-365] TEORÍA PRO, ESTUDIO Y LEYENDAS (FIN DEL CICLO 365) ---
  { q: "¿Cómo se llama el Grado VI de una escala diatónica?", options: ["Dominante", "Sensible", "Submediante", "Mediante"], correct: 2 },
  { q: "¿Qué estructura tiene un acorde disminuido?", options: ["3ª Mayor y 5ª Justa", "3ª Menor y 5ª Disminuida", "3ª Mayor y 5ª Aumentada", "3ª Menor y 5ª Justa"], correct: 1 },
  { q: "¿Qué estructura tiene un acorde aumentado?", options: ["3ª Menor y 5ª Disminuida", "3ª Mayor y 5ª Aumentada", "3ª Mayor y 5ª Justa", "3ª Menor y 5ª Justa"], correct: 1 },
  { q: "¿Qué significa el símbolo 'C' grande al principio de un pentagrama?", options: ["Clave de Do", "Compás de 4/4 (Compasillo)", "Cambio de tono", "Crescendo"], correct: 1 },
  { q: "¿En el círculo de quintas, qué tonalidad mayor viene justo a la derecha de Do Mayor?", options: ["Fa Mayor", "Re Mayor", "La Mayor", "Sol Mayor"], correct: 3 },
  { q: "¿Qué intervalo exacto hay entre Do y La?", options: ["Quinta", "Sexta", "Séptima", "Octava"], correct: 1 },
  { q: "¿Qué fracción representa a la figura 'Fusa'?", options: ["1/8", "1/16", "1/32", "1/64"], correct: 2 },
  { q: "¿A qué figura equivale la duración de un tresillo de corcheas?", options: ["A una negra", "A una blanca", "A una corchea", "A una fusa"], correct: 0 },
  { q: "¿Cómo se llama la cadencia armónica que va del Grado V al Grado I?", options: ["Plagal", "Rota", "Perfecta", "Imperfecta"], correct: 2 },
  { q: "¿Cómo se llama la cadencia armónica que va del Grado IV al Grado I?", options: ["Plagal (Amén)", "Perfecta", "Rota", "Frigia"], correct: 0 },
  { q: "¿Qué significa 'Rubato' en una interpretación musical?", options: ["Tocar sin instrumentos", "Tocar muy fuerte", "Acelerar o ralentizar el tempo con libertad expresiva", "Hacer silencios repentinos"], correct: 2 },
  { q: "¿Qué es una 'Modulación'?", options: ["Cambiar de instrumento", "Cambiar de tonalidad a mitad de la pieza", "Un error del amplificador", "Subir el volumen al máximo"], correct: 1 },
  { q: "¿Qué textura musical tiene una melodía principal acompañada por acordes?", options: ["Monofonía", "Polifonía", "Homofonía", "Cacofonía"], correct: 2 },
  { q: "¿Qué es la enarmonía de Sol bemol (Solb)?", options: ["Fa sostenido (Fa#)", "La bemol (Lab)", "Mi natural", "Fa doble sostenido"], correct: 0 },
  { q: "¿Qué tipo de compás es el 9/8?", options: ["Binario simple", "Ternario compuesto", "Cuaternario simple", "Amalgama irregular"], correct: 1 },
  { q: "¿Qué nota ocupa el primer espacio (abajo) en la clave de Fa?", options: ["Do", "Mi", "Sol", "La"], correct: 3 },
  { q: "¿Qué indica la barra de repetición?", options: ["Símbolo de silencio", "Doble barra con dos puntos para repetir una sección", "Sube el tono un semitono", "Fin definitivo de la obra"], correct: 1 },
  { q: "¿Para qué sirve un filtro 'High Pass' (Filtro Paso Alto) en un estudio?", options: ["Para dejar pasar los graves y cortar agudos", "Para cortar los graves y dejar pasar los agudos", "Para subir el volumen general", "Para afinar la voz"], correct: 1 },
  { q: "¿Qué efecto se basa en crear repeticiones del sonido (eco)?", options: ["Chorus", "Phaser", "Delay", "Fuzz"], correct: 2 },
  { q: "¿Qué es hacer 'Bouncing' o 'Bounce' en un DAW?", options: ["Bailar con la música", "Exportar la mezcla de varias pistas a un archivo estéreo de audio", "Borrar una pista por accidente", "Subir los graves"], correct: 1 },
  { q: "¿Cuál es la característica principal de un Micrófono de Cinta (Ribbon)?", options: ["Es indestructible", "Es ideal para bombos", "Es muy frágil y tiene un sonido muy cálido y vintage", "No necesita cable"], correct: 2 },
  { q: "¿Cómo se llama la cabeza de la guitarra donde van las clavijas en inglés?", options: ["Bridge", "Neck", "Fretboard", "Headstock"], correct: 3 },
  { q: "¿Cómo se dice 'Trastes' en inglés?", options: ["Strings", "Frets", "Pickups", "Knobs"], correct: 1 },
  { q: "¿Qué nota añade la quinta cuerda extra en un bajo de 5 cuerdas moderno?", options: ["Un Do agudo", "Un Si grave (B)", "Un Fa grave", "Un Mi agudo"], correct: 1 },
  { q: "¿Cuál es el tambor de la batería que tiene patas y se apoya en el suelo?", options: ["Tom aéreo", "Caja", "Tom base (Floor Tom)", "Bombo"], correct: 2 },
  { q: "¿Qué hace el pedal derecho del piano?", options: ["Sordina", "Acorta las notas", "Levanta los apagadores para que las notas resuenen (Sustain)", "Desplaza el teclado lateralmente"], correct: 2 },
  { q: "¿Qué hace el pedal izquierdo del piano (Una corda)?", options: ["Sube el volumen", "Hace que el sonido sea más suave y apagado", "Hace eco", "Toca notas automáticas"], correct: 1 },
  { q: "¿Qué instrumento electrónico se toca moviendo las manos en el aire sin tocarlo físicamente?", options: ["Sintetizador", "Theremin", "Melotrón", "Keytar"], correct: 1 },
  { q: "¿Qué legendario teclado de los años 60 usaba cintas magnéticas reales para cada tecla?", options: ["Mellotron", "Hammond", "Rhodes", "Moog"], correct: 0 },
  { q: "¿Qué significan las siglas VCO en un sintetizador analógico?", options: ["Virtual Computer Object", "Voltage-Controlled Oscillator", "Voice Chorus Output", "Volume Control Option"], correct: 1 },
  { q: "¿Cuántos canales de información puede transmitir un solo puerto MIDI?", options: ["8", "16", "32", "64"], correct: 1 },
  { q: "¿Qué hace un 'Preamp' (Preamplificador) en una interfaz de audio?", options: ["Apaga el equipo", "Añade graves", "Amplifica la débil señal de un micrófono a 'nivel de línea'", "Borra el ruido"], correct: 2 },
  { q: "¿Qué instrumento de viento metal no usa pistones ni válvulas, sino una vara deslizante?", options: ["Trompa", "Trombón", "Tuba", "Fliscorno"], correct: 1 },
  { q: "¿Qué instrumento de percusión de la orquesta clásica SÍ puede afinar notas exactas?", options: ["Caja", "Timbales sinfónicos (Timpani)", "Gong", "Platos de choque"], correct: 1 },
  { q: "¿Qué característica tiene un archivo MIDI?", options: ["Pesa muchísimo", "Contiene audio grabado en alta calidad", "No contiene audio, solo información (notas, duración, fuerza)", "Solo sirve para vídeos"], correct: 2 },
  { q: "¿Qué efecto altera el volumen cíclicamente (arriba y abajo) sin cambiar la nota?", options: ["Vibrato", "Chorus", "Tremolo", "Delay"], correct: 2 },
  { q: "¿Cuál fue el primer vídeo musical emitido en MTV en 1981?", options: ["Thriller", "Video Killed the Radio Star", "Take On Me", "Money for Nothing"], correct: 1 },
  { q: "¿Qué icónico artista es conocido como 'El Camaleón del Rock'?", options: ["Mick Jagger", "Freddie Mercury", "David Bowie", "Iggy Pop"], correct: 2 },
  { q: "¿A qué famoso álbum pertenece la portada de un prisma separando la luz en un arcoíris?", options: ["The Wall", "Abbey Road", "The Dark Side of the Moon", "A Night at the Opera"], correct: 2 },
  { q: "¿Qué famosa banda tiene como logo oficial una boca con la lengua roja sacada?", options: ["Aerosmith", "KISS", "The Rolling Stones", "Queen"], correct: 2 },
  { q: "¿En qué año se lanzó el álbum 'Thriller' de Michael Jackson?", options: ["1979", "1982", "1985", "1989"], correct: 1 },
  { q: "¿Qué guitarrista de rock es además Doctor en Astrofísica?", options: ["Brian May (Queen)", "Jimmy Page (Led Zeppelin)", "Tom Morello (Tenacious D)", "Slash (GNR)"], correct: 0 },
  { q: "¿Qué cantante asesinada trágicamente era conocida como 'La Reina del Tex-Mex'?", options: ["Gloria Estefan", "Celia Cruz", "Selena Quintanilla", "Shakira"], correct: 2 },
  { q: "¿Quién compuso y grabó la versión original del clásico del rock 'Johnny B. Goode'?", options: ["Elvis Presley", "Jerry Lee Lewis", "Chuck Berry", "Little Richard"], correct: 2 },
  { q: "¿Qué genio de la música clásica compuso la ópera 'La Flauta Mágica'?", options: ["Beethoven", "Mozart", "Wagner", "Puccini"], correct: 1 },
  { q: "¿Qué compositor ruso creó la música para el ballet 'El Cascanueces'?", options: ["Tchaikovsky", "Stravinsky", "Rachmaninov", "Prokofiev"], correct: 0 },
  { q: "¿Qué banda de Nu Metal es famosa por usar túnicas y terroríficas máscaras personalizadas?", options: ["Korn", "System of a Down", "Slipknot", "Limp Bizkit"], correct: 2 },
  { q: "¿Qué cantante pop hizo historia usando un corsé cónico diseñado por Jean Paul Gaultier?", options: ["Cher", "Madonna", "Lady Gaga", "Kylie Minogue"], correct: 1 },
  { q: "¿Qué cantautor canadiense es el compositor original de la famosísima canción 'Hallelujah'?", options: ["Jeff Buckley", "Bob Dylan", "Neil Young", "Leonard Cohen"], correct: 3 },
  { q: "¿En qué famoso grupo femenino comenzó su carrera Beyoncé?", options: ["TLC", "Spice Girls", "Destiny's Child", "The Pussycat Dolls"], correct: 2 },
  { q: "¿Cuál es el verdadero nombre de Lady Gaga?", options: ["Stefani Germanotta", "Katheryn Hudson", "Elizabeth Grant", "Robyn Fenty"], correct: 0 },
  { q: "¿Qué mítico club de Nueva York (cerrado en 2006) fue la cuna del punk estadounidense (Ramones, Blondie...)?", options: ["Studio 54", "CBGB", "The Cavern", "Whisky a Go Go"], correct: 1 },
  { q: "¿Cómo se llama el clásico modelo de guitarra Gibson que tiene una agresiva forma de 'V' invertida?", options: ["Explorer", "Firebird", "Flying V", "Les Paul"], correct: 2 },
  { q: "¿A qué velocidad giran normalmente los discos de vinilo de formato grande (LP)?", options: ["45 RPM", "78 RPM", "33 1/3 RPM", "120 RPM"], correct: 2 },
  { q: "¿Quién fue el polémico bajista y figura icónica de los Sex Pistols?", options: ["John Lydon", "Sid Vicious", "Paul Simonon", "Dee Dee Ramone"], correct: 1 },
  { q: "¿Quién era el líder, guitarrista y vocalista de The Clash?", options: ["Joe Strummer", "Mick Jones", "Paul Weller", "Billy Idol"], correct: 0 },
  { q: "¿Quién compuso el famosísimo vals 'El Danubio Azul'?", options: ["Richard Wagner", "Johann Strauss (hijo)", "Franz Liszt", "Johannes Brahms"], correct: 1 },
  { q: "¿Quién de estos tres NO pertenecía al trío de 'Los Tres Tenores' de los años 90?", options: ["Luciano Pavarotti", "Plácido Domingo", "José Carreras", "Andrea Bocelli"], correct: 3 },
  { q: "¿Qué legendario productor fue conocido como 'El Quinto Beatle'?", options: ["Rick Rubin", "Quincy Jones", "George Martin", "Phil Spector"], correct: 2 },
  { q: "¿Qué banda fue formada por Dave Mustaine tras ser expulsado de Metallica?", options: ["Slayer", "Megadeth", "Anthrax", "Pantera"], correct: 1 },
  { q: "¿Cómo se llama la técnica en la que el cantante produce una nota y a la vez silba otras por encima creando armonías?", options: ["Canto difónico", "Falsete", "Growl", "Scat"], correct: 0 },
  { q: "¿Qué rapero ha ganado más premios Grammy en la historia y es considerado un dios del Hip-Hop (Rap God)?", options: ["Tupac", "Snoop Dogg", "Eminem", "Jay-Z"], correct: 2 },
  { q: "¿Qué es un acorde de 'Quinta vacía' o Power Chord (usado en Rock/Metal)?", options: ["Un acorde con tres notas", "Un acorde de dos notas (Tónica y Quinta) sin la tercera", "Un acorde mayor séptima", "Un acorde disminuido"], correct: 1 },
  { q: "¿Cuál es el compás flamenco por excelencia, característico de bulerías y soleás?", options: ["Amalgama de 12 tiempos", "Compás de 4/4", "Compás de 3/4", "Compás de 5/8"], correct: 0 },
  { q: "¿A qué cantante de jazz estadounidense se la conocía como 'Lady Day'?", options: ["Ella Fitzgerald", "Billie Holiday", "Nina Simone", "Sarah Vaughan"], correct: 1 }
  
];
const getDayOfYear = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const getDayName = (dayIndex) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex];
};

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  return dateString.split('-').reverse().join('/');
};

const getNextClassInfo = (dayOfWeek, timeStr) => {
  const now = new Date();
  const targetDay = parseInt(dayOfWeek);
  let date = new Date(now.getTime());
  
  const [hours, minutes] = timeStr.split(':');
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

  const currentDay = now.getDay();
  let daysToAdd = targetDay - currentDay;
  
  if (daysToAdd < 0) {
    daysToAdd += 7;
  } else if (daysToAdd === 0 && now > date) {
    daysToAdd += 7;
  }
  
  date.setDate(now.getDate() + daysToAdd);
  
  const diffMs = date - now;
  const diffHours = diffMs / (1000 * 60 * 60);
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  return { date, dateStr, diffHours };
};

// HELPER: Calcula los meses para las gestiones
const getMonthNames = () => {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  
  return {
    next: nextMonth.toLocaleString('es-ES', { month: 'long' }),
    nextNext: nextNextMonth.toLocaleString('es-ES', { month: 'long' }),
    isLate: today.getDate() > 20 // Del 21 en adelante es tarde
  };
};

export default function StudentPortal({ user, logout, db, appId }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [myClasses, setMyClasses] = useState([]);
  const [allClasses, setAllClasses] = useState([]); 
  const [schoolCalendar, setSchoolCalendar] = useState([]); 
  const [announcements, setAnnouncements] = useState([]); 
  const [myGestiones, setMyGestiones] = useState([]); 
  const [activeTab, setActiveTab] = useState('home');
  const [notification, setNotification] = useState(null);

  const [absenceModal, setAbsenceModal] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [showContract, setShowContract] = useState(false); 
  const [contractText, setContractText] = useState(''); 
  const [onboarding, setOnboarding] = useState({ name: '', instrument: 'Guitarra', classId: '' });
  const [healthCheck, setHealthCheck] = useState(false); 

  // ESTADOS PARA GESTIONES GLOBALES
  const [gestionModal, setGestionModal] = useState(null);
  const [gestionText, setGestionText] = useState('');
  const [selectedInst, setSelectedInst] = useState('');
  const [selectedNewClass, setSelectedNewClass] = useState(null);
  const [acceptLatePenalty, setAcceptLatePenalty] = useState(false);
  const [isSendingGestion, setIsSendingGestion] = useState(false);

  // ESTADOS PARA MITOBOX
  const [mitoboxModal, setMitoboxModal] = useState(false);
  const [mboxDate, setMboxDate] = useState('');
  const [mboxSede, setMboxSede] = useState('Tarragona');
  const [mboxInst, setMboxInst] = useState('');
  const [mboxSelectedSlot, setMboxSelectedSlot] = useState(null);

  // ESTADOS PARA TRIVIA (RETO DIARIO)
  const [triviaModal, setTriviaModal] = useState(false);
  const [triviaTime, setTriviaTime] = useState(10);
  const [triviaSelected, setTriviaSelected] = useState(null);
  const [triviaResult, setTriviaResult] = useState(null); // 'win', 'lose', 'timeout'

  const timeRules = getMonthNames();
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    checkRegistration();
    fetchAllClassesAndCalendar();
    fetchContractText();

    const unsubAnnouncements = onSnapshot(collection(db, 'artifacts', appId, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setAnnouncements(data);
    });

    return () => unsubAnnouncements();
  }, [user.email]);

  useEffect(() => {
    if (!profile?.id) return;
    
    const unsubProfile = onSnapshot(doc(db, 'artifacts', appId, 'students', profile.id), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(prev => ({ ...prev, ...docSnap.data() }));
      }
    });

    const q = query(collection(db, 'artifacts', appId, 'gestiones'), where('studentId', '==', profile.id));
    const unsubGestiones = onSnapshot(q, (snapshot) => {
      setMyGestiones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubProfile();
      unsubGestiones();
    };
  }, [profile?.id, db, appId]);

  // LÓGICA DEL TEMPORIZADOR DEL RETO DIARIO
  useEffect(() => {
    let timer;
    if (triviaModal && triviaTime > 0 && triviaResult === null) {
      timer = setInterval(() => {
        setTriviaTime(prev => prev - 1);
      }, 1000);
    } else if (triviaTime === 0 && triviaResult === null) {
      handleTriviaAnswer(-1); // Tiempo agotado
    }
    return () => clearInterval(timer);
  }, [triviaModal, triviaTime, triviaResult]);

  const showToast = (msg, type = 'success') => {
    setNotification({ text: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchContractText = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'artifacts', appId, 'settings', 'global'));
      if (docSnap.exists() && docSnap.data().contract) {
        setContractText(docSnap.data().contract);
      } else {
        setContractText('El contrato de prestación de servicios aún no está disponible online. Por favor, contacta con administración.');
      }
    } catch (e) {
      console.log("Error cargando el contrato", e);
    }
  };

  const fetchAllClassesAndCalendar = async () => {
    try {
      const classesQuery = collectionGroup(db, 'recurringClasses');
      const classesSnap = await getDocs(classesQuery);
      const classesList = [];
      classesSnap.forEach(doc => {
        classesList.push({ id: doc.id, refPath: doc.ref.path, ...doc.data() });
      });
      setAllClasses(classesList);

      const calSnap = await getDocs(collection(db, 'artifacts', appId, 'calendar'));
      const calList = calSnap.docs.map(d => d.data());
      setSchoolCalendar(calList);
    } catch (e) {
      console.log("No se pudo cargar calendario/clases extra");
    }
  };

  const checkRegistration = async () => {
    setLoading(true);
    const q = query(collection(db, 'artifacts', appId, 'students'), where("email", "==", user.email));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const studentData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      setProfile(studentData);
      
      if (studentData.claimed) {
        await fetchRealStudentData(studentData.id);
      }
    }
    setLoading(false);
  };

  const fetchRealStudentData = async (studentId) => {
    try {
      const classesQuery = collectionGroup(db, 'recurringClasses');
      const classesSnap = await getDocs(classesQuery);
      
      const foundClasses = [];
      classesSnap.forEach(doc => {
        const data = doc.data();
        if (data.students && data.students.some(s => s.id === studentId)) {
          foundClasses.push({ id: doc.id, refPath: doc.ref.path, ...data });
        }
      });
      setMyClasses(foundClasses);

      const ticketsQuery = collectionGroup(db, 'tickets');
      const ticketsSnap = await getDocs(ticketsQuery);
      
      let validTicketsCount = 0;
      ticketsSnap.forEach(doc => {
        const data = doc.data();
        if (data.studentId === studentId && !data.isUsed) {
          validTicketsCount++;
        }
      });
      
      setProfile(prev => ({ ...prev, activeTickets: validTicketsCount }));

    } catch (error) {
      console.error("Error buscando datos:", error);
    }
  };

  const handleOnboarding = async (e) => {
    e.preventDefault();
    const studentId = Date.now().toString();
    const data = { 
        name: onboarding.name, 
        email: user.email, 
        claimed: true, 
        instruments: [onboarding.instrument],
        classes: onboarding.classId ? [onboarding.classId] : [],
        hasMitobox: false,
        hasMitoverso: false,
        triviaPoints: 0,
        triviaVictories: 0
    };
    await setDoc(doc(db, 'artifacts', appId, 'students', studentId), data);
    setProfile({ id: studentId, ...data });
    await fetchRealStudentData(studentId);
  };

  const openAbsenceModal = (clase) => {
    const info = getNextClassInfo(clase.dayOfWeek, clase.time);
    setHealthCheck(false); 
    setAbsenceModal({ clase, ...info });
  };

  const confirmAbsence = async (wantsTicket) => {
    if (!absenceModal || !profile) return;
    const status = (absenceModal.diffHours >= 16 && wantsTicket) ? 'notified' : 'notified_no_ticket';
    try {
      const classRef = doc(db, absenceModal.clase.refPath);
      await setDoc(classRef, { exceptions: { [absenceModal.dateStr]: { [profile.id]: status } } }, { merge: true });
      setAbsenceModal(null);
      showToast('Aviso enviado correctamente al profesor.');
      await fetchRealStudentData(profile.id);
    } catch (error) {
      showToast('Error al enviar el aviso.', 'error');
    }
  };

  const sendGestion = async () => {
    const isTicketRedemption = gestionModal.type === 'recuperacion';
    
    if (!isTicketRedemption && timeRules.isLate && !acceptLatePenalty) {
      showToast('Debes aceptar las condiciones de plazo marcando la casilla.', 'error');
      return;
    }
    
    setIsSendingGestion(true);
    try {
      const gestionId = Date.now().toString();
      const payload = {
        studentId: profile.id,
        studentName: profile.name,
        studentEmail: profile.email,
        type: gestionModal.type,
        title: gestionModal.title,
        details: gestionText,
        requestedClass: selectedNewClass ? selectedNewClass.id : null,
        targetMonth: (!isTicketRedemption && timeRules.isLate) ? timeRules.nextNext : timeRules.next,
        isLateRequest: !isTicketRedemption && timeRules.isLate,
        status: 'pendiente',
        date: new Date().toISOString()
      };

      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), payload);
      setGestionModal(null);
      setGestionText('');
      setSelectedNewClass(null);
      setAcceptLatePenalty(false);
      showToast('Solicitud enviada a Administración.');
    } catch (error) {
      showToast('Error al enviar la solicitud.', 'error');
    } finally {
      setIsSendingGestion(false);
    }
  };

  // --- FUNCIONES EXTRAS (MITOBOX / MITOVERSO) ---
  const requestMitoverso = () => {
    const ok = window.confirm('Serás redirigido al portal de inscripciones de Tadosi.\n\n⚠️ MUY IMPORTANTE: Cuando rellenes tus datos, no olvides marcar la casilla "Tengo una suscripción y quiero otra" para que el sistema reconozca tu descuento de alumno.');
    if (ok) window.open('https://qow.es/GKidLP', '_blank');
  };

  const requestMitobox = async () => {
    const ok = window.confirm('Serás redirigido al portal de inscripciones de Tadosi para formalizar tu alta en la tarifa plana.\n\nAl continuar, también enviaremos un aviso a administración.');
    if (ok) {
      window.open('https://qow.es/wIXCp7', '_blank');
      try {
        const gestionId = `mbox-req-${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
          studentId: profile.id,
          studentName: profile.name,
          studentEmail: profile.email,
          type: 'alta_mitobox',
          title: 'Solicitud Alta Mitobox',
          details: 'El alumno ha iniciado el proceso de alta en la tarifa plana Mitobox a través de Tadosi.',
          status: 'pendiente',
          date: new Date().toISOString()
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const sendMitoboxReservation = async () => {
    if (!mboxDate || !mboxSede || !mboxInst || !mboxSelectedSlot) return;
    setIsSendingGestion(true);
    try {
      const gestionId = `mbox-res-${Date.now()}`;
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
        studentId: profile.id,
        studentName: profile.name,
        studentEmail: profile.email,
        type: 'reserva_mitobox',
        title: 'Reserva de Sala (Mitobox)',
        details: `Reserva para ensayar: ${mboxInst}. Fecha: ${formatDateSpanish(mboxDate)}. Sede: ${mboxSede}. Hora: ${mboxSelectedSlot.time}h en ${mboxSelectedSlot.sala}`,
        status: 'pendiente',
        date: new Date().toISOString(),
        reservationDate: mboxDate
      });
      setMitoboxModal(false);
      setMboxDate('');
      setMboxSelectedSlot(null);
      setMboxInst('');
      showToast('Reserva de sala enviada. Espera confirmación.');
    } catch (e) {
      showToast('Error al reservar sala.', 'error');
    } finally {
      setIsSendingGestion(false);
    }
  };

  // --- LÓGICA DE TRIVIA ---
  // Multiplicamos por 137 (número primo) para que salte de categoría cada día sin repetir ninguna en todo el año.
const dailyQuestionIndex = (getDayOfYear() * 137) % TRIVIA_QUESTIONS.length;
  const currentQuestion = TRIVIA_QUESTIONS[dailyQuestionIndex];
  const hasPlayedToday = profile?.triviaLastPlayed === todayStr;

  const startTrivia = () => {
    setTriviaSelected(null);
    setTriviaResult(null);
    setTriviaTime(10);
    setTriviaModal(true);
  };

  const handleTriviaAnswer = async (index) => {
    if (triviaResult !== null) return;
    setTriviaSelected(index);
    
    let isCorrect = index === currentQuestion.correct;
    let newResult = isCorrect ? 'win' : (index === -1 ? 'timeout' : 'lose');
    setTriviaResult(newResult);
    
    let newPoints = profile.triviaPoints || 0;
    if (isCorrect) newPoints += 1;

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'students', profile.id), {
        triviaLastPlayed: todayStr,
        triviaPoints: newPoints
      });
    } catch (e) { console.error("Error guardando trivia", e); }

    setTimeout(() => {
      setTriviaModal(false);
    }, 2500); 
  };


  const pendingAbsences = [];
  const pendingProcedures = myGestiones.filter(g => g.status === 'pendiente' && g.type !== 'alta_mitobox'); 
  
  if (profile) {
    myClasses.forEach(clase => {
      if (clase.exceptions) {
        Object.keys(clase.exceptions).forEach(dateStr => {
          if (dateStr >= todayStr) {
            const status = clase.exceptions[dateStr][profile.id];
            if (status === 'notified') {
              pendingAbsences.push({
                subject: clase.subject,
                date: dateStr
              });
            }
          }
        });
      }
    });
  }

  const AbsenceModalOverlay = () => {
    if (!absenceModal) return null;
    const isLate = absenceModal.diffHours < 16;
    if (showRules) {
      return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
            <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            <div className="flex items-center gap-3 text-black mb-6"><FileText className="w-8 h-8" /><h2 className="text-xl font-black uppercase tracking-tight">Normativa</h2></div>
            <div className="space-y-4 text-sm text-zinc-600 font-medium">
              <p>1. <strong className="text-black">Preaviso de 16h:</strong> Para recuperar una clase, avisa con mín. 16 horas de antelación.</p>
              <p>2. <strong className="text-black">Caducidad:</strong> Los tickets caducan al mes siguiente de la falta.</p>
              <p>3. <strong className="text-black">Alta activa:</strong> Solo alumnos al corriente de pago pueden recuperar.</p>
              <p>4. <strong className="text-black">Causas justificadas:</strong> Las recuperaciones solo se concederán por motivos de salud, trabajo o estudios.</p>
              <p>5. <strong className="text-black">Límite de recuperación:</strong> Las clases de recuperación no se pueden volver a recuperar en caso de nueva falta.</p>
            </div>
            <button onClick={() => setShowRules(false)} className="w-full mt-8 bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest">Entendido</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
          <button onClick={() => setAbsenceModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          {isLate ? (
            <>
              <div className="flex items-center justify-center w-16 h-16 bg-red-100 text-red-500 rounded-full mb-6 mx-auto"><Clock className="w-8 h-8" /></div>
              <h2 className="text-2xl font-black text-center uppercase tracking-tight text-slate-800 mb-2">Aviso fuera de plazo</h2>
              <p className="text-center text-zinc-500 font-medium mb-6">Avisas con menos de 16h. Informaremos al profesor, pero <strong className="text-red-500">no generará ticket</strong>.</p>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(false)} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 shadow-lg">Avisar de todas formas</button>
                <button onClick={() => setAbsenceModal(null)} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200">Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full mb-6 mx-auto"><CheckCircle className="w-8 h-8" /></div>
              <h2 className="text-2xl font-black text-center uppercase tracking-tight text-slate-800 mb-2">Aviso a tiempo</h2>
              <p className="text-center text-zinc-500 font-medium mb-4">Informaremos a tu profesor. Tienes derecho a recuperar esta clase el próximo mes.</p>
              <h3 className="font-black text-center text-sm uppercase tracking-widest text-slate-800 mb-2">¿Quieres ticket de recuperación?</h3>
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
                <p className="text-xs text-amber-800 font-bold mb-3 leading-relaxed">Recuerda que solo se puede recuperar por razones de <strong>salud, trabajo o estudios</strong>.</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={healthCheck} onChange={e => setHealthCheck(e.target.checked)} className="w-4 h-4 accent-amber-600 rounded cursor-pointer" />
                  <span className="text-xs font-black text-amber-950 uppercase tracking-widest">Cumplo las condiciones</span>
                </label>
              </div>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(true)} disabled={!healthCheck} className="w-full bg-emerald-500 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-emerald-600 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed">Sí, quiero recuperarla</button>
                <button onClick={() => confirmAbsence(false)} className="w-full bg-zinc-800 text-zinc-300 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-black">No, gracias. Solo aviso.</button>
                <button onClick={() => setAbsenceModal(null)} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200">Cancelar</button>
              </div>
            </>
          )}
          <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
            <button onClick={() => setShowRules(true)} className="text-xs font-bold text-zinc-400 hover:text-black uppercase tracking-widest flex items-center justify-center gap-1 mx-auto"><FileText className="w-3 h-3"/> Leer Normativa de Recuperaciones</button>
          </div>
        </div>
      </div>
    );
  };

  const GestionModalOverlay = () => {
    if (!gestionModal) return null;
    const isClassSearch = gestionModal.type === 'cambio_horario' || gestionModal.type === 'ampliar_clases' || gestionModal.type === 'recuperacion';
    const isTicketRedemption = gestionModal.type === 'recuperacion';

    const availableClasses = isClassSearch ? allClasses.filter(c => {
      const targetInstrument = selectedInst || profile.instruments[0];
      if (c.subject !== targetInstrument) return false;
      const maxCap = parseInt(c.capacity || 4);
      const currentStudents = c.students?.length || 0;
      if (currentStudents >= maxCap) return false;
      if (c.students?.some(s => s.id === profile.id)) return false;
      if (isTicketRedemption && targetInstrument === 'Guitarra') {
        if (maxCap !== 8) return false;
      }
      return true;
    }) : [];

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative my-8">
          <button onClick={() => {setGestionModal(null); setSelectedNewClass(null); setAcceptLatePenalty(false);}} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-2">
            <gestionModal.icon className={`w-8 h-8 ${gestionModal.color}`} />
            <h2 className="text-xl font-black uppercase tracking-tight leading-tight">{gestionModal.title}</h2>
          </div>
          {!isTicketRedemption && (
            <>
              <div className="bg-zinc-100 rounded-xl p-3 mb-6 text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clock className="w-4 h-4"/> Normativa del día 20</div>
              {timeRules.isLate ? (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <h3 className="text-sm font-black text-red-800 uppercase mb-1 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Solicitud fuera de plazo</h3>
                  <p className="text-xs text-red-700 font-medium mb-3">Estás pidiendo este trámite del día 21 en adelante. Según el contrato de prestación de servicios, no podrá tramitarse para <strong>{timeRules.next}</strong>.</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={acceptLatePenalty} onChange={e => setAcceptLatePenalty(e.target.checked)} className="mt-1 w-4 h-4 text-red-600 rounded" />
                    <span className="text-xs font-bold text-red-900">Sí, quiero que tengáis mi petición en cuenta para <strong>{timeRules.nextNext}</strong>.</span>
                  </label>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl"><p className="text-xs font-bold text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> En plazo. Tu solicitud aplicará para <strong>{timeRules.next}</strong>.</p></div>
              )}
            </>
          )}
          <p className="text-sm font-medium text-zinc-500 mb-6">{gestionModal.desc}</p>
          {isClassSearch && (
            <div className="mb-6 space-y-4 border-t border-b border-zinc-100 py-4">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{isTicketRedemption ? '1. Elige el grupo para recuperar' : '1. Busca disponibilidad en directo'}</p>
              {gestionModal.type === 'ampliar_clases' && (
                <select value={selectedInst} onChange={e => setSelectedInst(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                  <option value="">Selecciona Instrumento...</option>
                  {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              )}
              {availableClasses.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                  {availableClasses.map(c => (
                    <div key={c.id} onClick={() => setSelectedNewClass(c)} className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedNewClass?.id === c.id ? 'border-black bg-zinc-50' : 'border-zinc-100 hover:border-zinc-300'}`}>
                      <div className="flex justify-between items-center mb-1"><span className="font-black text-sm uppercase">{getDayName(c.dayOfWeek)}</span><span className="text-xs font-bold bg-black text-white px-2 py-0.5 rounded">{c.time}h</span></div>
                      <div className="text-xs text-zinc-500 font-medium">Prof: {c.teacher} • Quedan {parseInt(c.capacity || 4) - (c.students?.length || 0)} plazas</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-zinc-100"><p className="text-xs font-bold text-zinc-500">No hay grupos {isTicketRedemption ? 'habilitados para recuperación' : 'grupales libres'}. Escríbenos a gestiones@escuelalosmitos.com</p></div>
              )}
            </div>
          )}
          <textarea placeholder={gestionModal.placeholder} value={gestionText} onChange={(e) => setGestionText(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[100px] resize-y text-sm font-medium mb-6"/>
          <button onClick={sendGestion} disabled={isSendingGestion || (!isTicketRedemption && timeRules.isLate && !acceptLatePenalty) || (isClassSearch && !selectedNewClass)} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
            {isSendingGestion ? 'Enviando...' : <><Send className="w-4 h-4"/> Enviar Solicitud</>}
          </button>
        </div>
      </div>
    );
  };

  const MitoboxModalOverlay = () => {
    if (!mitoboxModal) return null;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // MOTOR INTELIGENTE DE BÚSQUEDA DE SALAS
    let availableMboxSlots = [];
    if (mboxDate && mboxSede) {
      const targetDay = new Date(`${mboxDate}T00:00:00`).getDay();
      
      const allScheduledClasses = allClasses.filter(c => c.dayOfWeek === targetDay && c.sede === mboxSede);

      const aliveClasses = allScheduledClasses.filter(c => {
        if (c.cancelledDates?.includes(mboxDate)) return false; 
        const exceptionsEseDia = c.exceptions?.[mboxDate] || {};
        const activeStudents = (c.students || []).filter(s => {
          if (s.isPaused) return false;
          const estadoHoy = exceptionsEseDia[s.id];
          if (estadoHoy === 'absent' || estadoHoy === 'notified' || estadoHoy === 'notified_no_ticket') return false;
          return true;
        });

        if (activeStudents.length === 0) return false;
        return true;
      });

      const activeTimes = [...new Set(aliveClasses.map(c => c.time))].sort();
      
      activeTimes.forEach(t => {
        const occupiedSalas = aliveClasses.filter(c => c.time === t).map(c => c.sala);
        const allSalas = ['Sala 1', 'Sala 2', 'Sala 3'];
        const freeSalas = allSalas.filter(s => !occupiedSalas.includes(s));
        
        freeSalas.forEach(fs => {
          availableMboxSlots.push({ time: t, sala: fs });
        });
      });
    }

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative my-8">
          <button onClick={() => {setMitoboxModal(false); setMboxDate(''); setMboxSelectedSlot(null);}} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          
          <div className="flex items-center gap-3 text-black mb-6">
            <DoorOpen className="w-8 h-8 text-blue-500" />
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight leading-none">Reservar Sala</h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Servicio Mitobox</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">1. ¿Qué instrumento tocarás?</label>
              <select value={mboxInst} onChange={e => setMboxInst(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                <option value="">Selecciona Instrumento...</option>
                {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">2. Fecha (Mín. 24h vista)</label>
              <input type="date" min={tomorrowStr} value={mboxDate} onChange={e => {setMboxDate(e.target.value); setMboxSelectedSlot(null);}} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800" />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">3. Centro</label>
              <select value={mboxSede} onChange={e => {setMboxSede(e.target.value); setMboxSelectedSlot(null);}} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                <option value="Tarragona">Tarragona</option>
                <option value="Reus">Reus</option>
              </select>
            </div>
          </div>

          {mboxDate && mboxSede && (
            <div className="mb-6 space-y-4 border-t border-zinc-100 pt-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">4. Salas y Horas disponibles</label>
              {availableMboxSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {availableMboxSlots.map((slot, i) => (
                    <button 
                      key={i} 
                      onClick={() => setMboxSelectedSlot(slot)} 
                      className={`p-3 rounded-xl border-2 text-left transition-all ${mboxSelectedSlot === slot ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-zinc-100 hover:border-blue-300 text-slate-700'}`}
                    >
                      <div className="font-black text-sm">{slot.time}h</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">{slot.sala}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-dashed border-zinc-200">
                  <p className="text-xs font-bold text-zinc-500">No hay salas libres o escuela cerrada para la fecha y centro elegidos.</p>
                </div>
              )}
            </div>
          )}

          <button onClick={sendMitoboxReservation} disabled={isSendingGestion || !mboxDate || !mboxSelectedSlot || !mboxInst} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-blue-700 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSendingGestion ? 'Enviando...' : <><CheckCircle className="w-4 h-4"/> Confirmar Reserva</>}
          </button>
        </div>
      </div>
    );
  };

  const ContractOverlay = () => {
    if (!showContract) return null;
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
          <button onClick={() => setShowContract(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full z-10"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-6 shrink-0">
            <FileText className="w-8 h-8" />
            <h2 className="text-xl font-black uppercase tracking-tight leading-none">Contrato de Servicios</h2>
          </div>
          <div className="overflow-y-auto pr-2 text-sm text-slate-600 font-medium leading-relaxed flex-1 space-y-4 whitespace-pre-wrap">
            {contractText}
          </div>
          <button onClick={() => setShowContract(false)} className="w-full mt-6 bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shrink-0 shadow-lg hover:bg-zinc-800 transition-colors">Cerrar Contrato</button>
        </div>
      </div>
    );
  };

  const TriviaModalOverlay = () => {
    if (!triviaModal) return null;
    return (
      <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative flex flex-col items-center">
          
          <div className="w-full bg-zinc-100 rounded-full h-2 mb-8 overflow-hidden">
            <div className="bg-amber-400 h-full transition-all duration-1000 linear" style={{ width: `${(triviaTime / 10) * 100}%` }}></div>
          </div>
          <div className="text-3xl font-black mb-6 flex items-center justify-center w-16 h-16 rounded-full border-4 border-zinc-100 text-slate-800">
            {triviaTime}
          </div>

          <h2 className="text-xl font-black text-center text-slate-800 mb-8 leading-tight">{currentQuestion.q}</h2>

          <div className="w-full space-y-3">
            {currentQuestion.options.map((opt, idx) => {
              let btnClass = "bg-white border-2 border-zinc-200 text-slate-700 hover:border-black";
              if (triviaResult !== null) {
                if (idx === currentQuestion.correct) btnClass = "bg-emerald-500 border-emerald-500 text-white"; 
                else if (idx === triviaSelected) btnClass = "bg-rose-500 border-rose-500 text-white"; 
                else btnClass = "bg-zinc-100 border-zinc-200 text-zinc-400 opacity-50"; 
              }

              return (
                <button 
                  key={idx} 
                  disabled={triviaResult !== null}
                  onClick={() => handleTriviaAnswer(idx)}
                  className={`w-full p-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${btnClass}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {triviaResult === 'win' && <p className="mt-6 text-emerald-600 font-black animate-bounce uppercase tracking-widest text-sm">¡Correcto! +1 Punto</p>}
          {triviaResult === 'lose' && <p className="mt-6 text-rose-600 font-black uppercase tracking-widest text-sm">¡Incorrecto!</p>}
          {triviaResult === 'timeout' && <p className="mt-6 text-rose-600 font-black uppercase tracking-widest text-sm">¡Se acabó el tiempo!</p>}

        </div>
      </div>
    );
  };


  if (loading) return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-black">Sincronizando perfil...</div>;

  if (!profile) {
    return (
      <div className="min-h-screen bg-white p-8 flex flex-col justify-center max-w-md mx-auto">
        <div className="bg-black text-white p-4 rounded-2xl w-fit mb-6 rotate-3"><Music/></div>
        <h1 className="text-3xl font-black uppercase tracking-tight leading-none mb-2">¡Bienvenido!</h1>
        <p className="text-zinc-500 font-medium mb-8">Configura tu portal de alumno para empezar.</p>
        <form onSubmit={handleOnboarding} className="space-y-4">
          <div><label className="text-[10px] font-black uppercase text-zinc-400">Nombre Completo</label><input required type="text" value={onboarding.name} onChange={e => setOnboarding({...onboarding, name: e.target.value})} className="w-full p-4 bg-zinc-50 border rounded-xl font-bold" /></div>
          <div><label className="text-[10px] font-black uppercase text-zinc-400">¿Qué estudias?</label><select value={onboarding.instrument} onChange={e => setOnboarding({...onboarding, instrument: e.target.value})} className="w-full p-4 bg-zinc-50 border rounded-xl font-bold">{INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
          <button type="submit" className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase mt-6 flex justify-center items-center gap-2">Activar Mi Portal <ArrowRight/></button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 relative">
      <AbsenceModalOverlay />
      <GestionModalOverlay />
      <MitoboxModalOverlay />
      <ContractOverlay />
      <TriviaModalOverlay />
      {notification && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[60] animate-in slide-in-from-top-4 duration-300 w-max max-w-[90%]">
          <div className={`px-6 py-3 rounded-full shadow-2xl text-white font-bold text-sm uppercase tracking-widest flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-600' : 'bg-black'}`}>
            {notification.type === 'error' ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
            {notification.text}
          </div>
        </div>
      )}

      <header className="bg-white p-5 sticky top-0 z-50 shadow-sm border-b border-zinc-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-black p-2 rounded-xl text-white"><Music className="w-5 h-5"/></div><div><h1 className="text-lg font-black uppercase leading-none">Mi Portal</h1><span className="text-[10px] font-bold text-zinc-400 uppercase">{profile.name}</span></div></div>
          <button onClick={logout} className="p-2 text-zinc-400 hover:text-rose-500 transition-colors"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
        
        {/* --- PESTAÑA 1: INICIO --- */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            <div className="bg-white border-2 border-zinc-100 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Hola, {profile.name.split(' ')[0]}</h2>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Escuela Los Mitos</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-amber-50 text-amber-600 px-4 py-2 rounded-xl flex items-center gap-2">
                  <Trophy className="w-4 h-4"/>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">Puntos Mes</p>
                    <p className="font-black leading-none">{profile.triviaPoints || 0}</p>
                  </div>
                </div>
                {profile.triviaVictories > 0 && (
                  <div className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl flex items-center gap-2">
                    <Star className="w-4 h-4"/>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest leading-none">Victorias</p>
                      <p className="font-black leading-none">{profile.triviaVictories}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* BANNER DEL RETO DIARIO */}
            {!hasPlayedToday ? (
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-3xl p-1 text-white shadow-xl relative overflow-hidden transform hover:scale-[1.02] transition-transform cursor-pointer" onClick={startTrivia}>
                <div className="bg-black/10 absolute inset-0"></div>
                <div className="relative z-10 p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2 mb-1"><Trophy className="w-6 h-6 text-amber-200"/> Reto del Día</h3>
                    <p className="text-xs font-bold text-amber-100 uppercase tracking-widest">¡Responde rápido, suma puntos y gana premios!.</p>
                  </div>
                  <button className="w-full sm:w-auto bg-white text-orange-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg flex items-center justify-center gap-2 pointer-events-none">
                    <Timer className="w-4 h-4"/> Jugar Ahora
                  </button>
                </div>
                <p className="relative z-10 text-[9px] font-bold text-center text-amber-100/70 pb-2 px-4 uppercase tracking-widest">Condición indispensable: Ser alumno activo y al corriente de pago para optar a premios.</p>
              </div>
            ) : (
              <div className="bg-zinc-100 border-2 border-zinc-200 rounded-3xl p-6 text-center shadow-sm">
                <CheckCircle className="w-8 h-8 text-zinc-300 mx-auto mb-2"/>
                <p className="font-black text-slate-800 uppercase tracking-tight">Ya has jugado hoy</p>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">Vuelve mañana a por más puntos.</p>
              </div>
            )}

            <h3 className="font-black uppercase tracking-widest text-xs text-zinc-400 px-2 flex items-center gap-2 mt-8"><Calendar className="w-4 h-4"/> Mis Clases Asignadas</h3>
            
            {myClasses.length === 0 ? (
              <div className="p-8 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <Music className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="font-bold text-zinc-400 uppercase tracking-widest text-sm">Todavía no tienes clases asignadas.</p>
              </div>
            ) : (
              myClasses.map((clase, idx) => {
                const classInfo = getNextClassInfo(clase.dayOfWeek, clase.time);
                const holidayMatch = schoolCalendar.find(c => c.date === classInfo.dateStr);
                const hasNotifiedNext = clase.exceptions?.[classInfo.dateStr]?.[profile.id];

                if (holidayMatch) {
                  const isFestivo = holidayMatch.type === 'festivo';
                  return (
                    <div key={idx} className={`rounded-3xl p-6 shadow-md relative overflow-hidden mb-4 border-2 ${isFestivo ? 'bg-red-50 border-red-200' : 'bg-purple-50 border-purple-200'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        {isFestivo ? <AlertCircle className="w-6 h-6 text-red-500"/> : <Sun className="w-6 h-6 text-purple-500"/>}
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isFestivo ? 'text-red-900' : 'text-purple-900'}`}>{isFestivo ? 'Día Festivo' : 'Vacaciones'}</h2>
                      </div>
                      <p className={`font-bold uppercase text-[10px] tracking-widest mb-4 ${isFestivo ? 'text-red-600' : 'text-purple-600'}`}>{holidayMatch.title || 'Escuela Cerrada'} • {classInfo.dateStr}</p>
                      <p className={`text-sm font-medium mb-4 ${isFestivo ? 'text-red-800' : 'text-purple-800'}`}>Tu próxima clase de {clase.subject} coincide con un día no lectivo oficial. La escuela permanecerá cerrada.</p>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="bg-black text-white rounded-3xl p-6 shadow-xl relative overflow-hidden mb-4">
                      <p className="text-zinc-400 font-bold uppercase text-[10px] tracking-widest mb-1">Clase de {clase.subject}</p>
                      <h2 className="text-3xl font-black uppercase tracking-tighter">{getDayName(clase.dayOfWeek)}</h2>
                      <p className="text-lg font-medium text-zinc-300 mb-6">{clase.time}h</p>
                      <div className="flex flex-col sm:flex-row gap-3 text-sm font-medium text-zinc-300 mb-8 bg-zinc-800/50 p-4 rounded-2xl border border-zinc-700/50">
                        <span className="flex items-center gap-2"><User className="w-4 h-4"/> Prof: {clase.teacher}</span> <span className="hidden sm:inline text-zinc-600">•</span> <span className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {clase.sede} ({clase.sala})</span>
                      </div>
                      
                      {/* BLOQUEO DEL BOTÓN SI YA AVISÓ */}
                      {hasNotifiedNext ? (
                        <div className="w-full bg-zinc-800/50 text-emerald-400 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-emerald-900/50">
                          <CheckCircle className="w-4 h-4" /> Falta Notificada
                        </div>
                      ) : (
                        <button onClick={() => openAbsenceModal(clase)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-zinc-700 transition-all shadow-lg active:scale-95">
                          <AlertCircle className="w-4 h-4 text-amber-400" /> No podré asistir
                        </button>
                      )}
                  </div>
                );
              })
            )}

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg flex items-center gap-2"><Ticket className="w-5 h-5 text-amber-500"/> Recuperaciones</h3>
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-black">{profile.activeTickets || 0} Tickets</span>
              </div>
              <button 
                disabled={!profile.activeTickets} 
                onClick={() => setGestionModal({
                  type: 'recuperacion', title: 'Canjear Ticket', icon: Ticket, color: 'text-amber-500',
                  desc: 'Elige el grupo en el que quieres gastar tu ticket. Si no encuentras disponibilidad, vuelve a mirar otro día.',
                  placeholder: 'Añade observaciones para el profesor (Opcional)...'
                })}
                className={`w-full font-black py-4 rounded-xl shadow-sm uppercase text-xs tracking-widest transition-colors ${profile.activeTickets > 0 ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'}`}
              >
                {profile.activeTickets > 0 ? 'Canjear Ticket Libre' : 'No tienes tickets'}
              </button>
            </div>

            {/* --- SECCIÓN: EN TRÁMITE --- */}
            {(pendingProcedures.length > 0 || pendingAbsences.length > 0) && (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200 mt-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500"/> En Trámite
                </h3>
                <div className="space-y-3">
                  {pendingAbsences.map((abs, i) => (
                    <div key={`abs-${i}`} className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-between">
                       <div>
                         <p className="text-xs font-black uppercase text-slate-800 tracking-tight">Falta: {abs.subject}</p>
                         <p className="text-[10px] font-bold text-zinc-500 uppercase mt-1">{formatDateSpanish(abs.date)}</p>
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700">
                         Esperando Ticket
                       </span>
                    </div>
                  ))}
                  {pendingProcedures.map(proc => (
                    <div key={proc.id} className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-between">
                       <div>
                         <p className="text-xs font-black uppercase text-slate-800 tracking-tight">{proc.title}</p>
                         <p className="text-[10px] font-bold text-zinc-500 uppercase mt-1">Solicitado el {new Date(proc.date).toLocaleDateString('es-ES')}</p>
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg">
                         En revisión
                       </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="text-center mt-4">
              <button onClick={() => setShowContract(true)} className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4">Ver contrato de prestación de servicios</button>
            </div>
          </div>
        )}

        {/* --- PESTAÑA: CALENDARIO --- */}
        {activeTab === 'calendar' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-black text-white border-2 border-zinc-800 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Calendario</h2>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Días no lectivos oficiales</p>
              </div>
              <Calendar className="w-20 h-20 text-zinc-800 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
               {schoolCalendar.length === 0 ? (
                 <div className="text-center py-8">
                   <Calendar className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                   <p className="font-bold text-zinc-400 uppercase tracking-widest text-sm">No hay festivos registrados</p>
                 </div>
               ) : (
                 <div className="space-y-3">
                   {schoolCalendar.sort((a,b) => a.date.localeCompare(b.date)).map((cal, i) => {
                     const isPast = cal.date < new Date().toISOString().split('T')[0];
                     return (
                       <div key={i} className={`p-4 rounded-2xl border flex justify-between items-center ${isPast ? 'bg-zinc-50 border-zinc-100 opacity-60' : cal.type === 'festivo' ? 'bg-red-50 border-red-100 text-red-900' : 'bg-purple-50 border-purple-100 text-purple-900'}`}>
                         <div>
                           <span className="text-[10px] font-black uppercase tracking-widest opacity-60 block">{cal.type}</span>
                           <span className="font-bold text-sm">{cal.title || 'Día no lectivo'}</span>
                         </div>
                         <span className="font-black text-sm">{formatDateSpanish(cal.date)}</span>
                       </div>
                     );
                   })}
                 </div>
               )}
            </div>
          </div>
        )}

        {/* --- PESTAÑA: EXTRAS --- */}
        {activeTab === 'extras' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-900 text-white border-2 border-indigo-800 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Mitos+</h2>
                <p className="text-blue-200 font-bold text-xs uppercase tracking-widest mt-1">Sácale más partido a tu música</p>
              </div>
              <Sparkles className="w-24 h-24 text-white/10 absolute -right-4 -bottom-4 pointer-events-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-100 flex flex-col h-full relative overflow-hidden">
                {profile?.hasMitoverso && (
                  <div className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3"/> Suscripción Activa
                  </div>
                )}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${profile?.hasMitoverso ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                  <MonitorPlay className="w-8 h-8"/>
                </div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Mitoverso</h3>
                <p className="text-sm text-zinc-500 font-medium mb-6 flex-1">
                  Accede a nuestra plataforma de cursos online, audios y recursos exclusivos. Ideal para alumnos de guitarra que quieren avanzar a su ritmo desde casa.
                </p>
                {!profile?.hasMitoverso && (
                  <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl mb-6">
                    <span className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-1">Precio Alumno</span>
                    <span className="text-xl font-black text-slate-800">15€ <span className="text-sm text-zinc-500">/ mes</span></span>
                  </div>
                )}
                
                {profile?.hasMitoverso ? (
                  <button 
                    onClick={() => window.open('https://classroom.google.com/', '_blank')}
                    className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    Entrar a Classroom <ArrowRight className="w-4 h-4"/>
                  </button>
                ) : (
                  <button 
                    onClick={requestMitoverso}
                    className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg"
                  >
                    Solicitar Acceso
                  </button>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-100 flex flex-col h-full relative overflow-hidden">
                {profile?.hasMitobox && (
                  <div className="absolute top-4 right-4 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3"/> Tarifa Plana Activa
                  </div>
                )}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${profile?.hasMitobox ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
                  <DoorOpen className="w-8 h-8"/>
                </div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Mitobox</h3>
                <p className="text-sm text-zinc-500 font-medium mb-6 flex-1">
                  ¿No puedes ensayar en casa? Con nuestra tarifa plana puedes reservar las aulas de la escuela que estén vacías para venir a practicar siempre que quieras.
                </p>
                {!profile?.hasMitobox && (
                  <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl mb-6">
                    <span className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-1">Tarifa Plana</span>
                    <span className="text-xl font-black text-slate-800">35€ <span className="text-sm text-zinc-500">/ mes</span></span>
                  </div>
                )}
                
                {profile?.hasMitobox ? (
                  <button 
                    onClick={() => setMitoboxModal(true)}
                    className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-blue-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-4 h-4"/> Reservar Sala
                  </button>
                ) : (
                  <button 
                    onClick={requestMitobox}
                    className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg"
                  >
                    Solicitar Acceso
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* --- PESTAÑA: TABLÓN --- */}
        {activeTab === 'news' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-black text-white border-2 border-zinc-800 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Tablón de Avisos</h2>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Novedades de la escuela</p>
              </div>
              <Bell className="w-20 h-20 text-zinc-800 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            {announcements.length === 0 ? (
               <div className="p-10 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <Megaphone className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                <p className="font-black text-slate-800 uppercase tracking-widest text-lg">El tablón está vacío</p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map(ann => (
                  <div key={ann.id} className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-200">
                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg leading-none mb-1">{ann.title}</h3>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">{ann.date}</p>
                    <p className="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA: GESTIONES --- */}
        {activeTab === 'contact' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-zinc-100 border-2 border-zinc-200 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800">Trámites</h2>
                <p className="text-zinc-500 font-bold text-xs uppercase tracking-widest mt-1">Gestión rápida de tu plaza</p>
              </div>
              <MessageSquare className="w-20 h-20 text-zinc-200 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-amber-100 text-amber-900 text-xs font-medium leading-relaxed">
              <strong className="font-black uppercase tracking-widest text-[10px] block mb-1 text-amber-700">Normativa Administrativa:</strong>
              Todas las gestiones (bajas, cambios de horario, mantenimientos) que modifiquen la facturación deben solicitarse antes del <strong>día 20 de cada mes</strong>. Las peticiones enviadas del 21 en adelante, tendrán efecto en el mes siguiente.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                onClick={() => setGestionModal({
                  type: 'cambio_horario', title: 'Cambiar Horario Fijo', icon: RefreshCcw, color: 'text-blue-500',
                  desc: 'Busca una plaza libre en otro grupo y solicita el cambio para el mes que viene.',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-black text-left transition-all shadow-sm group"
              >
                <div className="bg-blue-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><RefreshCcw className="w-6 h-6 text-blue-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Cambiar Horario Fijo</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Solicita otro día u hora</p>
              </button>

              <button 
                onClick={() => setGestionModal({
                  type: 'ampliar_clases', title: 'Añadir Otra Clase', icon: PlusCircle, color: 'text-emerald-500',
                  desc: 'Añade una hora extra o empieza con un nuevo instrumento grupal.',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-black text-left transition-all shadow-sm group"
              >
                <div className="bg-emerald-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><PlusCircle className="w-6 h-6 text-emerald-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Ampliar Mis Clases</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Apunta un nuevo instrumento</p>
              </button>

              <button 
                onClick={() => setGestionModal({
                  type: 'mantenimiento', title: 'Pasar a Mantenimiento', icon: Snowflake, color: 'text-amber-500',
                  desc: 'Si necesitas un respiro temporal pero no quieres perder tu plaza ni tus ventajas. Recuerda que la cuota de mantenimiento es de 15€/Mes. Si quieres mantener mas de un mes tendrás que solicitarlo mes a mes. Esta gestión afecta solo al mes que viene',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-black text-left transition-all shadow-sm group"
              >
                <div className="bg-amber-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Snowflake className="w-6 h-6 text-amber-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Cuota Mantenimiento</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Congela tu plaza temporalmente</p>
              </button>

              <button 
                onClick={() => setGestionModal({
                  type: 'baja', title: 'Dar de Baja mi Plaza', icon: UserMinus, color: 'text-red-500',
                  desc: 'Solicita la cancelación de tu suscripción en la escuela. Te echaremos de menos.',
                  placeholder: '¿Podrías decirnos brevemente el motivo? Nos ayuda a mejorar (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-red-500 text-left transition-all shadow-sm group"
              >
                <div className="bg-red-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><UserMinus className="w-6 h-6 text-red-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Dar de Baja</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Cancela tu suscripción</p>
              </button>

              <a 
                href="mailto:gestiones@escuelalosmitos.com?subject=Otras%20Gestiones%20-%20Portal%20Alumno"
                className="col-span-1 sm:col-span-2 bg-black p-6 rounded-3xl border-2 border-black hover:bg-zinc-800 text-left transition-all shadow-md group flex items-center justify-between"
              >
                <div>
                  <h3 className="font-black text-white uppercase tracking-tight text-lg">Otras Gestiones (Mail)</h3>
                  <p className="text-xs font-medium text-zinc-400 mt-1">Clases particulares, dudas de facturación...</p>
                </div>
                <div className="bg-zinc-800 p-4 rounded-full group-hover:scale-110 transition-transform"><Mail className="w-6 h-6 text-white"/></div>
              </a>

            </div>
          </div>
        )}

      </main>

      <nav className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-zinc-200 z-40 pb-3">
        <div className="flex justify-around items-center p-2 max-w-3xl mx-auto">
          {[
            {id:'home', i:LayoutGrid, label:'Inicio'}, 
            {id:'calendar', i:Calendar, label:'Calendario'}, 
            {id:'extras', i:Sparkles, label:'Extras'},
            {id:'news', i:Info, label:'Avisos'}, 
            {id:'contact', i:MessageSquare, label:'Gestiones'}
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === t.id ? 'text-black' : 'text-zinc-400 hover:text-black'}`}>
              <t.i className="w-6 h-6"/>
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
