import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";

const calculateEmojiCoords = (targetRect, align = "right") => {
  if (!targetRect) return { top: 0, left: 0 };

  const popoverWidth = 320;
  const popoverHeight = 384;
  const windowHeight = window.innerHeight;
  const windowWidth = window.innerWidth;

  let left;
  let top;

  if (align === "right-side") {
    left = targetRect.right + 8;
    top = targetRect.bottom - popoverHeight;

    if (left + popoverWidth > windowWidth - 10) {
      left = targetRect.left - popoverWidth - 8;
    }
    if (top < 10) {
      top = targetRect.top;
    }
    if (top + popoverHeight > windowHeight - 10) {
      top = windowHeight - popoverHeight - 10;
    }
  } else {
    left = targetRect.right - popoverWidth + 8;
    top = targetRect.top - popoverHeight - 12;

    if (top < 10) {
      top = targetRect.bottom + 8;
    }
  }

  if (left < 10) left = 10;
  if (left + popoverWidth > windowWidth - 10) {
    left = windowWidth - popoverWidth - 10;
  }

  return { top, left };
};

const EMOJI_CATEGORIES = [
  {
    id: "faces",
    name: "Caras & Personas",
    icon: "sentiment_satisfied",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
      "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😜", "🤪", "😎",
      "🥳", "🤔", "🤨", "😐", "😑", "🙄", "😬", "😔", "😢", "😭",
      "😠", "😡", "🤯", "🥵", "🥶", "😱", "😴", "🤢", "😈", "💀",
      "👽", "🤖", "💩", "🤡", "👤"
    ]
  },
  {
    id: "hands",
    name: "Gestos & Manos",
    icon: "back_hand",
    emojis: [
      "👋", "👍", "👎", "👊", "✌️", "👌", "🤌", "🤏", "🤘", "🤟",
      "🤝", "🙏", "👏", "🙌", "💪", "🧠", "👀", "✍️"
    ]
  },
  {
    id: "hearts",
    name: "Corazones & Símbolos",
    icon: "favorite",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "☮️", "✝️",
      "☪️", "🕉️", "☸️", "✡️", "☯️", "🆔", "⚛️", "☣️", "⚠️", "🚫",
      "🌀", "💤"
    ]
  },
  {
    id: "food",
    name: "Comida & Bebida",
    icon: "local_pizza",
    emojis: [
      "🍏", "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑",
      "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🌶️", "🌽", "🥕",
      "🥔", "🍕", "🍔", "🍟", "🌭", "🍿", "🍜", "🍝", "🍧", "🍦",
      "🍩", "🍪", "🍰", "🎂", "🍫", "🍬", "☕", "🥤", "🧋", "🍺",
      "🍻", "🍷", "🍹", "🥂", "🍾"
    ]
  },
  {
    id: "activities",
    name: "Actividades & Deportes",
    icon: "sports_esports",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸",
      "🏒", "⛳", "🏹", "🎣", "🥊", "🥋", "🛹", "🚴", "🏃", "🧗",
      "🧘", "🎮", "🕹️", "🎲", "🧩", "♟️", "🎭", "🎨", "🎤", "🎧",
      "🎬", "🎹"
    ]
  },
  {
    id: "places",
    name: "Viajes & Lugares",
    icon: "travel_explore",
    emojis: [
      "🚗", "🚕", "🚙", "🚌", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚",
      "🚜", "🏍️", "🛵", "🚲", "🚉", "🚁", "✈️", "🚀", "🛸", "⛵",
      "⚓", "🗺️", "🧭", "🏔️", "🌋", "⛺", "🏜️", "🏖️", "🏛️", "🏠",
      "🏢", "🏨", "🏥", "🏦", "🏫"
    ]
  },
  {
    id: "objects",
    name: "Objetos & Clima",
    icon: "lightbulb",
    emojis: [
      "🔥", "💥", "⚡", "☀️", "❄️", "🌟", "⭐", "🌈", "💡", "🔔",
      "💯", "📌", "💻", "📱", "🎁", "💎", "👑", "🏆", "📢", "📣",
      "🛎️", "🔑", "🛡️", "⚙️", "✉️", "📦"
    ]
  }
];

const EMOJI_KEYWORDS = {
  // Faces
  "😀": "smile happy smile face grin risa feliz alegre sonrisa cara",
  "😃": "smile happy smile face grin risa feliz alegre sonrisa cara",
  "😄": "smile happy smile face grin risa feliz alegre sonrisa cara",
  "😁": "smile happy smile face grin risa feliz alegre sonrisa cara",
  "😆": "smile happy smile face grin risa feliz alegre sonrisa cara",
  "😅": "smile happy face sweat risa sudor nervioso cara",
  "😂": "cry laugh tears joy risa llanto alegria lagrimas",
  "🤣": "cry laugh tears joy roll floor risa carcajada llanto",
  "😊": "smile happy face blush sonrojo feliz sonrisa cara",
  "😇": "angel heaven innocent santo inocente celestial halo",
  "🙂": "smile face happy leve sonrisa cara",
  "🙃": "upside down face al reves cara",
  "😉": "wink face guiño ojo cara",
  "😌": "relieved face relief alivio calma relajado cara",
  "😍": "heart eyes love amor enamorado ojos corazon",
  "🥰": "heart face love warm amor enamorado corazones cara",
  "😘": "kiss blow heart amor beso cara",
  "😜": "tongue wink joke guiño lengua broma loco cara",
  "🤪": "crazy wild goofy loco chiflado divertido cara",
  "😎": "cool glasses sunglasses sol gafas estilo pro cara",
  "🥳": "party celebrate fiesta celebrar gorro confeti cara",
  "🤔": "think question ponder pensar duda pensar cara",
  "🤨": "raised eyebrow suspicious sospecha duda ceja cara",
  "😐": "neutral deadpan serio neutral indiferente cara",
  "😑": "expressionless flat serio plano cara",
  "🙄": "roll eyes roll desprecio ojos rodar cara",
  "😬": "grimace teeth mueca dientes tension cara",
  "😔": "sad pensive triste reflexivo penoso cara",
  "😢": "sad cry tear triste llanto lagrimas pena cara",
  "😭": "sad cry sob tears llanto lagrimas desconsuelo pena triste cara",
  "😠": "angry mad enojado enfadado rabia cara",
  "😡": "angry mad red rabia furioso rojo cara",
  "🤯": "mind blown explode explosion cabeza explota cerebro cara",
  "🥵": "hot heat red sweat calor sofoco caliente sudor rojo cara",
  "🥶": "cold ice blue congelado frio azul hielo cara",
  "😱": "scream fear scared horror grito miedo asustado cara",
  "😴": "sleep zzz tired dormir sueño cansado zzz cara",
  "🤢": "nausea sick vomit verde asco enfermo vomito cara",
  "😈": "devil horn evil diablo cuernos malvado morado",
  "💀": "skull dead death calavera muerto muerte hueso",
  "👽": "alien space ufo extraterrestre marciano espacio",
  "🤖": "robot tech bot maquina robotico",
  "💩": "poop shit caca mierda mojón",
  "🤡": "clown joker payaso bromista risa",
  "👤": "user profile shadow silueta usuario perfil sombra",
  
  // Gestures
  "👋": "wave hello goodbye salut saludo hola adios mano",
  "👍": "like ok yes good plus like aprobo bien ok mano",
  "👎": "dislike no bad minus dislike desaprobo mal no mano",
  "👊": "fist punch golpe puño mano",
  "✌️": "peace victory paz victoria mano",
  "👌": "ok hand perfect ok perfecto mano",
  "🤌": "italian gesture que quieres mano",
  "🤏": "pinch little poco pellizco mano",
  "🤘": "rock metal cuernos mano",
  "🤟": "love you gesture amor mano",
  "🤝": "handshake agree deal trato apreton manos",
  "🙏": "pray please thanks rezar por favor gracias manos",
  "👏": "applause clap aplauso aplaudir manos",
  "🙌": "hooray praise celebracion manos arriba",
  "💪": "muscle strength power fuerza musculo brazo",
  "🧠": "brain mind thinking cerebro mente cabeza",
  "👀": "eyes look watch ver mirar ojos",
  "✍️": "write draw pen escribir dibujar lapiz mano",
  
  // Hearts & Symbols
  "❤️": "heart love red corazon amor rojo",
  "🧡": "heart love orange corazon naranja",
  "💛": "heart love yellow corazon amarillo",
  "💚": "heart love green corazon verde",
  "💙": "heart love blue corazon azul",
  "💜": "heart love purple corazon morado",
  "🖤": "heart love black corazon negro",
  "🤍": "heart love white corazon blanco",
  "🤎": "heart love brown corazon cafe",
  "💔": "heart broken heartbreak corazon roto desamor",
  "❣️": "heart exclamation corazon exclamacion",
  "💕": "hearts love corazones amor",
  "💞": "hearts revolving corazones girando",
  "💓": "heart beating corazon latiendo",
  "💗": "heart growing corazon creciendo",
  "💖": "heart sparkle corazon brillante",
  "💘": "heart arrow cupid corazon flecha cupido",
  "💝": "heart ribbon gift corazon regalo",
  "☮️": "peace sign paz",
  "✝️": "cross religion cruz religion",
  "☪️": "star crescent islam estrella media luna",
  "🕉️": "om hinduism om",
  "☸️": "dharma wheel budismo",
  "✡️": "star david judaismo",
  "☯️": "yin yang taoismo",
  "🆔": "id button identi",
  "⚛️": "atom physics atomo",
  "☣️": "biohazard biologico",
  "⚠️": "warning alert peligro advertencia",
  "🚫": "prohibited ban prohibido",
  "🌀": "cyclone spiral ciclon espiral",
  "💤": "zzz sleep sleeping zzz sueño dormir",

  // Food
  "🍏": "apple green manzana verde fruta comida",
  "🍎": "apple red manzana roja fruta comida",
  "🍊": "orange tangerine naranja fruta comida",
  "🍋": "lemon limon fruta comida",
  "🍌": "banana platano fruta comida",
  "🍉": "watermelon sandia fruta comida",
  "🍇": "grapes uvas fruta comida",
  "🍓": "strawberry fresa fruta comida",
  "🍒": "cherries cerezas fruta comida",
  "🍑": "peach durazno melocoton fruta comida",
  "🍍": "pineapple piña fruta comida",
  "🥥": "coconut coco fruta comida",
  "🥝": "kiwi fruta comida",
  "🍅": "tomato tomate verdura comida",
  "🍆": "eggplant berenjena verdura comida",
  "🥑": "avocado palta aguacate verdura comida",
  "🥦": "broccoli brocoli verdura comida",
  "🌶️": "pepper spicy picante chile verdura comida",
  "🌽": "corn choclo elote verdura comida",
  "🥕": "carrot zanahoria verdura comida",
  "🥔": "potato papa patata verdura comida",
  "🍕": "pizza queso cheese comida fastfood",
  "🍔": "burger hamburger hamburguesa carne comida fastfood",
  "🍟": "french fries papas fritas comida fastfood",
  "🌭": "hotdog perro caliente comida fastfood",
  "🍿": "popcorn palomitas pochoclos comida fastfood",
  "🍜": "ramen soup sopa fideos comida",
  "🍝": "spaghetti pasta tallarines fideos comida",
  "🍧": "shaved ice helado postre dulce comida",
  "🍦": "icecream helado cono postre comida",
  "🍩": "donut dona postre dulce comida",
  "🍪": "cookie galleta postre dulce comida",
  "🍰": "cake pastel torta postre dulce comida",
  "🎂": "birthday cake pastel cumpleaños vela comida",
  "🍫": "chocolate barra dulce comida",
  "🍬": "candy caramelo dulce comida",
  "☕": "coffee cafe taza hot caliente te bebida",
  "🥤": "cup straw gaseosa bebida refresco",
  "🧋": "boba bubble tea te de burbujas bebida",
  "🍺": "beer cerveza bebida alcohol chop",
  "🍻": "beers cervezas brindis alcohol chops bebida",
  "🍷": "wine vino copa alcohol bebida",
  "🍹": "drink tropical coctel trago alcohol bebida",
  "🥂": "cheers toast brindis copas bebida",
  "🍾": "champagne champaña botella fiesta bebida",

  // Activities & Sports
  "⚽": "soccer football badminton futbol deporte pelota",
  "🏀": "basketball balon pelota basquetbol deporte",
  "🏈": "football pelota futbol americano deporte",
  "⚾": "baseball pelota beisbol deporte",
  "🎾": "tennis pelota tenis deporte",
  "🏐": "volleyball pelota voleibol deporte",
  "🏉": "rugby pelota rugby deporte",
  "🎱": "pool billiard bola 8 billar deporte juego",
  "🏓": "pingpong table tennis paleta ping pong deporte",
  "🏸": "badminton raqueta volante badminton deporte",
  "🏒": "hockey stick puck hockey deporte",
  "⛳": "golf flag hoyo golf deporte",
  "🏹": "bow arrow arco flecha tiro deporte",
  "🎣": "fishing rod caña pescar deporte",
  "🥊": "boxing glove guante boxeo deporte pelear",
  "🥋": "martial arts karate judo kimono deporte pelear",
  " skateboard": "skateboard patineta skate deporte",
  "🚴": "bike bicycle ciclista bicicleta deporte",
  "🏃": "running run correr atleta deporte",
  "🧗": "climbing escalator montaña deporte",
  "🧘": "meditation yoga meditar yoga zen deporte",
  "🎮": "game controller joystick gamepad videojuego consola play nintendo xbox pc",
  "🕹️": "joystick arcade retro palanca juego",
  "🎲": "dice die dado juego azar",
  "🧩": "puzzle pieza rompecabezas juego",
  "♟️": "chess pawn peon ajedrez juego",
  "🎭": "theater drama masks teatro mascaras arte drama",
  "🎨": "art paint palette paleta pintura arte pintar",
  "🎤": "microphone mic cantar karaoke microfono musica",
  "🎧": "headphones music cascos auriculares musica",
  "🎬": "clapper board cine pelicula director claqueta",
  "🎹": "piano keyboard teclado musica instrumento",

  // Places
  "🚗": "car red auto coche carro vehiculo viaje",
  "🚕": "taxi yellow cab taxi amarillo viaje",
  "🚙": "suv blue auto jeep viaje",
  "🚌": "bus colectivo autobus viaje",
  "🏎️": "racecar f1 auto carrera formula 1",
  "🚓": "police car patrulla policia auto",
  " Ambulance": "ambulance ambulancia salud hospital auto",
  " Fire Engine": "fire engine bomberos camion auto",
  " Caravan": "caravan minibus furgoneta van auto",
  "🚐": "minibus furgoneta van auto",
  "🚚": "delivery truck camion reparto flete",
  " Tractor": "tractor campo granja vehiculo",
  "🏍️": "motorcycle moto moto vehiculo viaje",
  "🛵": "scooter moto motoneta vehiculo",
  "🚲": "bicycle bici bicicleta vehiculo deporte",
  "🚉": "station train estacion tren subte",
  " Helicopter": "helicopter helicoptero volador",
  "✈️": "airplane plane avion vuelo viaje",
  "🚀": "rocket space despegue cohete espacio",
  "🛸": "ufo ovni platillo volador espacio",
  "⛵": "sailboat velero barco vela mar",
  "⚓": "anchor ancla barco puerto mar",
  "🗺️": "map mapa viaje gps",
  "🧭": "compass brujula viaje orientacion",
  "🏔️": "mountain snow montaña nieve pico",
  " Volcano": "volcano volcan fuego lava",
  "⛺": "tent camp acampar carpa carpa",
  " Desert": "desert desierto calor sol cactus",
  " Beach": "beach beach sol mar playa sombrilla",
  "🏛️": "temple classical building templo museo edificio",
  "🏠": "house home casa hogar",
  "🏢": "office building oficina edificio",
  "🏨": "hotel hotel hospedaje",
  " Hospital": "hospital hospital salud medicina",
  " Bank": "bank banco dinero finanzas",
  " School": "school escuela colegio educacion",

  // Objects
  "🔥": "fire hot flame hoguera fuego flama calor",
  "💥": "collision spark explosion choque explosion",
  "⚡": "lightning voltage rayo electricity energia",
  "☀️": "sun sunny warm sol despejado calor clima",
  " Snowflake": "snowflake snow cold nieve copo frio clima",
  "🌟": "star glowing estrella brillante luz",
  "⭐": "star estrella favorita",
  "🌈": "rainbow arcoiris color lluvia cielo",
  "💡": "lightbulb idea bombilla luz foco",
  "¼": "percent cent 100 cien perfecto nota",
  "💯": "hundred 100 cien perfecto nota",
  "📌": "pushpin pin chincheta nota fijar",
  "💻": "laptop computer notebook pc ordenador tecnologia",
  "📱": "phone smartphone mobile celular telefono tecnologia",
  "🎁": "gift present regalo sorpresa de cumpleaños",
  "💎": "gem diamond diamante joya valioso",
  "👑": "crown king queen corona rey reina owner",
  "🏆": "trophy prize copa trofeo ganador campeon",
  "📢": "loudspeaker altavoz anuncio",
  "📣": "megaphone megafono grito anuncio",
  " Timbre": "bellhop timbre recepcion hotel",
  "🔑": "key llave abrir candado",
  "🛡️": "shield protection defense escudo proteccion defensa",
  "⚙️": "gear cog engranaje ajustes opciones tool",
  "✉️": "envelope letter mail sobre carta correo mensaje",
  "📦": "package box caja paquete envio"
};

export default function EmojiPickerPopover({ targetRect, onSelectEmoji, onClose, triggerRef, align = "right" }) {
  const { t } = useTranslation();
  const popoverRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const sectionRefs = useRef({});
  const isClickScrolling = useRef(false);
  const scrollTimeoutRef = useRef(null);

  const [coords, setCoords] = useState(() => calculateEmojiCoords(targetRect, align));
  const [activeTab, setActiveTab] = useState("faces");
  const [searchTerm, setSearchTerm] = useState("");
  const [recentEmojis, setRecentEmojis] = useState([]);

  // Load recent emojis on mount and play open sound
  useEffect(() => {
    soundEngine.playNav("open");
    try {
      const saved = localStorage.getItem("onicord_recent_emojis");
      if (saved) {
        setRecentEmojis(JSON.parse(saved));
      }
    } catch (e) {
      console.error("[Emoji Picker] Error loading recent emojis:", e);
    }
  }, []);

  // Track coordinates for absolute positioning
  useLayoutEffect(() => {
    if (!targetRect) return;
    setCoords(calculateEmojiCoords(targetRect, align));
  }, [targetRect, align]);

  // Click outside to close
  useEffect(() => {
    const handleMouseDownOutside = (e) => {
      if (triggerRef?.current && triggerRef.current.contains(e.target)) {
        return; // Ignore click on trigger button to avoid double toggle race condition
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleMouseDownOutside);
    return () => {
      document.removeEventListener("mousedown", handleMouseDownOutside);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [onClose, triggerRef]);

  // Close on scroll
  useEffect(() => {
    const handleScroll = (e) => {
      if (popoverRef.current && popoverRef.current.contains(e.target)) {
        return; // Ignore scroll inside the picker itself
      }
      onClose?.();
    };

    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  if (!targetRect) return null;

  // Add an emoji to recent list (max 14)
  const handleSelectEmojiLocal = (emoji) => {
    onSelectEmoji?.(emoji);

    const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 14);
    setRecentEmojis(updated);
    try {
      localStorage.setItem("onicord_recent_emojis", JSON.stringify(updated));
    } catch (e) {
      console.error("[Emoji Picker] Error saving recent emojis:", e);
    }

    onClose?.();
  };

  // Perform search based on characters, category name or keywords
  const getFilteredSearchResults = () => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];

    const results = [];
    const allUniqueEmojis = Array.from(
      new Set([
        ...recentEmojis,
        ...EMOJI_CATEGORIES.flatMap((c) => c.emojis)
      ])
    );

    allUniqueEmojis.forEach((emoji) => {
      // 1. Match emoji character directly
      if (emoji === term) {
        results.push(emoji);
        return;
      }

      // 2. Match associated keywords (multi-lingual)
      const keywords = EMOJI_KEYWORDS[emoji] || "";
      if (keywords.includes(term)) {
        results.push(emoji);
        return;
      }

      // 3. Match category name matching
      const parentCat = EMOJI_CATEGORIES.find((c) => c.emojis.includes(emoji));
      if (parentCat && parentCat.name.toLowerCase().includes(term)) {
        results.push(emoji);
      }
    });

    return results;
  };

  // Scroll Sync: Track container scroll and highlight active category tab
  const handleScroll = (e) => {
    if (isClickScrolling.current) return;
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;

    const categoriesToCheck = [
      ...(recentEmojis.length > 0 ? [{ id: "recent" }] : []),
      ...EMOJI_CATEGORIES
    ];

    // 1. Detect if we reached the absolute bottom of the container
    const isAtBottom = container.scrollHeight - scrollTop <= container.clientHeight + 12;
    if (isAtBottom && categoriesToCheck.length > 0) {
      const lastCat = categoriesToCheck[categoriesToCheck.length - 1].id;
      if (lastCat !== activeTab) {
        setActiveTab(lastCat);
      }
      return;
    }

    // 2. Standard offset evaluation
    let currentActive = categoriesToCheck[0]?.id || "faces";

    for (let i = 0; i < categoriesToCheck.length; i++) {
      const cat = categoriesToCheck[i];
      const el = sectionRefs.current[cat.id];
      if (el) {
        // offsetTop is relative to scroll container
        const relativeTop = el.offsetTop - container.offsetTop;
        // Check if container has scrolled past the section start (with 20px margin threshold)
        if (scrollTop >= relativeTop - 20) {
          currentActive = cat.id;
        }
      }
    }

    if (currentActive !== activeTab) {
      setActiveTab(currentActive);
    }
  };

  // Click on a Tab: smoothly scroll scrollContainer to target category section
  const handleTabClick = (catId) => {
    soundEngine.playNav("select");
    setActiveTab(catId);
    const container = scrollContainerRef.current;
    const el = sectionRefs.current[catId];
    if (container && el) {
      isClickScrolling.current = true;
      const targetScrollTop = el.offsetTop - container.offsetTop;
      
      container.scrollTo({ top: targetScrollTop, behavior: "smooth" });

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isClickScrolling.current = false;
      }, 500);
    }
  };

  const filteredSearchResults = getFilteredSearchResults();

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      className="onicord-floating-menu w-80 h-96 flex flex-col !p-0 overflow-hidden z-[99999] onicord-picker-transition"
    >
      {/* Search Header */}
      <div className="p-2.5 border-b border-white/10 bg-onicord-mantle/50 flex items-center gap-2">
        <MaterialIcon name="search" size="lg" className="text-onicord-muted pl-1" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("chat.searchEmojisPlaceholder")}
          className="w-full bg-transparent text-xs text-white placeholder-onicord-muted outline-none"
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="text-onicord-muted hover:text-white text-xs pr-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs Navigation (only when not searching) */}
      {!searchTerm && (
        <div className="flex items-center justify-around px-2 py-1.5 border-b border-white/5 bg-white/[0.02] shrink-0">
          {/* Clock icon for Recents if populated */}
          {recentEmojis.length > 0 && (
            <button
              onClick={() => handleTabClick("recent")}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer ${
                activeTab === "recent"
                  ? "bg-onicord-accent text-white scale-110 font-bold"
                  : "hover:bg-onicord-accent/50 text-onicord-text hover:text-white/80"
              }`}
              title={t("chat.emojis.recent", "Recientes")}
            >
              <MaterialIcon name="schedule" size={16} />
            </button>
          )}

          {/* Standard Categories */}
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleTabClick(cat.id)}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer ${
                activeTab === cat.id
                  ? "bg-onicord-accent text-white scale-110 font-bold"
                  : "hover:bg-onicord-accent/50 text-onicord-text hover:text-white/80"
              }`}
              title={t(`chat.emojis.${cat.id}`, cat.name)}
            >
              <MaterialIcon name={cat.icon} size={16} />
            </button>
          ))}
        </div>
      )}

      {/* Emoji Scroll Area */}
      {searchTerm ? (
        // Search Results Mode (Single Grid)
        <div className="flex-1 overflow-y-auto p-2.5 custom-scrollbar">
          <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 mb-1.5">
            {t("chat.searchEmojisPlaceholder", "Resultados de búsqueda")}
          </h4>
          <div className="grid grid-cols-7 gap-1 content-start">
            {filteredSearchResults.map((emoji, idx) => (
              <button
                key={`${emoji}-${idx}`}
                onClick={() => handleSelectEmojiLocal(emoji)}
                className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-transform duration-100 active:scale-125 hover:scale-110 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
          {filteredSearchResults.length === 0 && (
            <div className="py-8 text-center text-xs text-onicord-faded italic">
              {t("chat.noSearchResults", "No results found")}
            </div>
          )}
        </div>
      ) : (
        // Unified Scrollable Categories List
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-2.5 space-y-4 custom-scrollbar pb-36"
        >
          {/* Recents list if available */}
          {recentEmojis.length > 0 && (
            <div
              key="recent"
              ref={(el) => (sectionRefs.current["recent"] = el)}
              className="space-y-1.5"
            >
              <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-white/5 pb-1">
                {t("chat.emojis.recent", "Recientes")}
              </h4>
              <div className="grid grid-cols-7 gap-1 pt-1">
                {recentEmojis.map((emoji, idx) => (
                  <button
                    key={`recent-${emoji}-${idx}`}
                    onClick={() => handleSelectEmojiLocal(emoji)}
                    className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-transform duration-100 active:scale-125 hover:scale-110 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Standard Categories list */}
          {EMOJI_CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              ref={(el) => (sectionRefs.current[cat.id] = el)}
              className="space-y-1.5 animate-fade-in"
            >
              <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-white/5 pb-1">
                {t(`chat.emojis.${cat.id}`, cat.name)}
              </h4>
              <div className="grid grid-cols-7 gap-1 pt-1">
                {cat.emojis.map((emoji, idx) => (
                  <button
                    key={`${cat.id}-${emoji}-${idx}`}
                    onClick={() => handleSelectEmojiLocal(emoji)}
                    className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-transform duration-100 active:scale-125 hover:scale-110 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
