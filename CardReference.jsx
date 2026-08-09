import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { LogIn } from "lucide-react";

const cards = [
  {
    description: "Lana Del Rey",
    title: "Summertime Sadness",
    src: "https://assets.aceternity.com/demos/lana-del-rey.jpeg",
    ctaText: "Play",

    content: (
      <p className="text-md text-gray-500">
        Lana Del Rey, an iconic American singer-songwriter, is celebrated for
        her melancholic and cinematic music style. Born Elizabeth Woolridge
        Grant in New York City, she has captivated audiences worldwide with her
        haunting voice and introspective lyrics. <br /> <br /> Her songs often
        explore themes of tragic romance, glamour, and melancholia, drawing
        inspiration from both contemporary and vintage pop culture.
      </p>
    ),
  },
  {
    description: "The Weeknd",
    title: "Blinding Lights",

    src: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e6/The_Weeknd_-_Blinding_Lights.png/250px-The_Weeknd_-_Blinding_Lights.png",
    ctaText: "Play",

    content: (
      <p className="text-md text-gray-500">
        The Weeknd, born Abel Tesfaye, is a Canadian artist known for blending
        R&B, pop, and synthwave into his unique sound. His track "Blinding
        Lights" became a global sensation, defining the sound of the 2020s with
        its retro vibes and emotional depth.
      </p>
    ),
  },
  {
    description: "Billie Eilish",
    title: "Happier Than Ever",
    src: "https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e",
    ctaText: "Play",

    content: (
      <p className="text-md text-gray-500">
        Billie Eilish redefined pop music with her haunting vocals and dark,
        intimate lyrics. Her song “Happier Than Ever” showcases her range and
        emotional storytelling, transforming from quiet melancholy to raw
        intensity.
      </p>
    ),
  },
  {
    description: "Taylor Swift",
    title: "All Too Well",
    src: "https://i.scdn.co/image/ab67616d0000b273da5d5aeeabacacc1263c0f4b",
    ctaText: "Play",

    content: (
      <p className="text-md text-gray-500">
        Taylor Swift is celebrated for her narrative songwriting and evolution
        across genres. “All Too Well (10 Minute Version)” is a masterclass in
        storytelling, capturing heartbreak with vivid emotional detail.
      </p>
    ),
  },
  {
    description: "Post Malone",
    title: "Circles",
    src: "https://i.scdn.co/image/ab6761610000f178b645c02cfa05103299775097",
    ctaText: "Play",

    content: (
      <p className="text-md text-gray-500">
        Post Malone blends hip-hop, rock, and pop effortlessly. “Circles” is a
        reflective anthem about love and repetition, showcasing his melodic
        instincts and laid-back vocal delivery.
      </p>
    ),
  },
];

const navItems = [
  {
    title: "Home",
    href: "/",
  },
  {
    title: "About",
    href: "/about",
  },
  {
    title: "Contact",
    href: "/contact",
  },
  {
    title: "Login",
    href: "/login",
  },
];

const ExpandableCardList = () => {
  const [currentCard, setCurrentCard] = useState(null);
  const [hovered, setHovered] = useState(null);

  const cardRef = useRef(null);

  // TODO: Missing keyboard accessibility (Escape key to close)
  // Improvement: Add keyboard event listener for Escape key
  // Example:
  // const handleKeyDown = useCallback((e) => {
  //   if (e.key === 'Escape' && currentCard) setCurrentCard(null);
  // }, [currentCard]);

  useEffect(() => {
    // Only add the listener if a card is currently open
    if (!currentCard) return;

    // TODO: Event handler should be memoized with useCallback
    // Improvement: Move handleClickOutside outside useEffect and wrap with useCallback
    // This prevents recreating the function on every render
    const handleClickOutside = (event) => {
      // Check if the click is outside the card element
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        setCurrentCard(null); // Closes the card
      }
    };

    // Add event listener to the whole document
    document.addEventListener("mousedown", handleClickOutside);

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [currentCard]);

  //NOTE:
  // The main concept of the switching between list and detailed view is implemented using layoutId prop from motion library. When a card is clicked, its layoutId matches the one in the detailed view, enabling a smooth transition i.e. from list to detailed view and vice versa since both views share the 'same' layoutId.

  const handleCardClick = (card) => {
    setCurrentCard(card);
  };

  return (
    <div className="relative min-h-screen w-full bg-gray-100">
      {/* TODO: Missing body scroll lock when modal is open */}
      {/* Improvement: Prevent background scrolling when card is expanded */}
      {/* Example: Use useEffect to toggle overflow: hidden on body */}

      {currentCard && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-10 h-full w-full bg-black/5 backdrop-blur-sm"
          />

          <motion.div
            layoutId={`card-${currentCard.title}`}
            ref={cardRef}
            className="fixed inset-0 z-20 m-auto flex h-[596px] w-100 flex-col gap-5 rounded-2xl bg-white p-5 shadow-xl"
          >
            <motion.img
              layoutId={`card-image-${currentCard.title}`}
              src={currentCard.src}
              alt={currentCard.title}
              loading="lazy"
              className="mx-2 h-68 rounded-lg object-cover"
            />

            <div className="flex items-center justify-between px-1">
              <div className="flex flex-col items-start pl-3">
                <motion.h2
                  layoutId={`card-title-${currentCard.title}`}
                  className="font-semibold text-neutral-800"
                >
                  {currentCard.title}
                </motion.h2>
                <motion.p
                  layoutId={`card-description-${currentCard.description}`}
                  className="text-sm font-medium text-gray-500"
                >
                  {currentCard.description}
                </motion.p>
              </div>

              <motion.button
                layoutId={`card-cta-${currentCard.title}`}
                className="items-center rounded-2xl bg-green-500 px-4 py-1 text-center font-medium text-white"
              >
                {currentCard.ctaText}
              </motion.button>
            </div>

            <motion.div
              initial={{
                opacity: 0,
                filter: "blur(10px)",
              }}
              animate={{
                opacity: 1,
                filter: "blur(0px)",
              }}
              transition={{ delay: 0.25 }}
              className="h-50 overflow-auto mask-[linear-gradient(to_top,transparent,black_30%)] px-4"
            >
              {currentCard.content}
            </motion.div>
          </motion.div>
        </>
      )}

      <div className="flex flex-col gap-35">
        <nav
          className="mx-auto mt-7 w-full max-w-xl rounded-2xl shadow-[0_3px_10px_rgb(0,0,0,0.2)]"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Navigation Bar */}
          <ul className="flex items-center justify-between px-6 py-2">
            {navItems.map((item, idx) => (
              <li key={item.title} className="relative mx-auto">
                <motion.a
                  href={item.href}
                  className="relative flex items-center gap-2 px-6 py-1 font-medium"
                  onMouseEnter={() => {
                    setHovered(idx);
                  }}
                >
                  {hovered === idx && (
                    <motion.span
                      transition={{
                        duration: 0.3,
                        type: "spring",
                        stiffness: 100,
                        mass: 0.5,
                      }}
                      layoutId="hover"
                      className="absolute inset-0 rounded-full bg-black"
                    />
                  )}

                  <motion.span
                    className="relative flex items-center gap-2"
                    animate={{
                      color: hovered === idx ? "#ffffff" : "#4b5563",
                    }}
                  >
                    {item.title === "Login" && <LogIn size={16} />}
                    {item.title}
                  </motion.span>
                </motion.a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-auto flex w-xl flex-col gap-8 px-4">
          {cards.map((card, idx) => (
            <motion.div
              layoutId={`card-${card.title}`}
              onClick={() => {
                handleCardClick(card);
              }}
              key={card.title}
              className="flex cursor-pointer items-center justify-between rounded-lg bg-white px-7 py-5 shadow-sm transition-colors hover:bg-gray-100"
            >
              <div className="flex gap-4">
                <motion.img
                  layoutId={`card-image-${card.title}`}
                  src={card.src}
                  alt={card.title}
                  loading="lazy"
                  className="aspect-square h-18 rounded-xl"
                />
                <div className="flex flex-col items-start pt-0.5">
                  <motion.h2
                    layoutId={`card-title-${card.title}`}
                    className="text-lg font-semibold text-neutral-900"
                  >
                    {card.title}
                  </motion.h2>
                  <motion.p
                    layoutId={`card-description-${card.description}`}
                    className="text-sm font-medium text-gray-500"
                  >
                    {card.description}
                  </motion.p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-4">
                <motion.button
                  layoutId={`card-cta-${card.title}`}
                  className="cursor-pointer rounded-2xl bg-green-500 px-3 py-1 text-white"
                >
                  {card.ctaText}
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExpandableCardList;