'use client';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Coffee,
  Compass,
  Cpu,
  Dumbbell,
  Film,
  Flower2,
  Gamepad2,
  Globe2,
  GraduationCap,
  Heart,
  House,
  Leaf,
  Music2,
  Minus,
  Plus,
  Palette,
  PawPrint,
  Plane,
  Search,
  Sparkles,
  Sprout,
  Telescope,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { interestCategories, type CustomTag } from '@/lib/feed';

export type OnboardingStep = 'intro' | 'explore' | 'exclude';

type OnboardingProps = {
  step: OnboardingStep;
  transitionDirection: 'forward' | 'backward';
  wantedTags: string[];
  blockedTags: string[];
  customTags: CustomTag[];
  onStepChange: (step: OnboardingStep) => void;
  onWantedTagsChange: (tags: string[]) => void;
  onBlockedTagsChange: (tags: string[]) => void;
  onCustomTagsChange: (tags: CustomTag[]) => void;
  onComplete: () => void;
};

const categoryIcons = [
  Trophy,
  Music2,
  Gamepad2,
  Film,
  Sparkles,
  Coffee,
  Plane,
  Palette,
  Cpu,
  Telescope,
  Heart,
  Dumbbell,
  Leaf,
  BookOpen,
  Flower2,
  House,
  PawPrint,
  Compass,
  Wallet,
  GraduationCap,
  Globe2,
  Globe2,
  Users,
  Compass,
];
const allTags = interestCategories.flatMap((category) =>
  category.domains.flatMap((domain) => domain.tags),
);

function AnimatedWords({ children, offset = 0 }: { children: string; offset?: number }) {
  return (
    <span className="onboarding-heading-line">
      {children.split(' ').map((word, index) => (
        <span className="onboarding-word-mask" key={word + index}>
          <span
            className="onboarding-word"
            style={{ '--word-delay': offset + index * 65 + 'ms' } as CSSProperties}
          >
            {word}
          </span>{' '}
        </span>
      ))}
    </span>
  );
}

function RevealCard({
  children,
  index,
  hue,
  className = '',
}: {
  children: ReactNode;
  index: number;
  hue: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState<{ delay: number } | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      setReveal({ delay: 0 });
      return;
    }
    const mountedAt = performance.now();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReveal({
            delay: performance.now() - mountedAt < 500 ? 40 + (index % 6) * 35 : (index % 4) * 30,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [index]);
  return (
    <div
      ref={ref}
      className={'onboarding-card-reveal ' + (reveal ? 'is-revealed ' : '') + className}
      onFocusCapture={() => setReveal({ delay: 0 })}
      style={
        {
          '--card-hue': hue,
          '--card-delay': (reveal?.delay ?? 0) + 'ms',
          '--card-tilt': (index % 2 ? 5 : -5) + 'deg',
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

export default function Onboarding({
  step,
  transitionDirection,
  wantedTags,
  blockedTags,
  customTags,
  onStepChange,
  onWantedTagsChange,
  onBlockedTagsChange,
  onCustomTagsChange,
  onComplete,
}: OnboardingProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [customTagOpen, setCustomTagOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState('');
  const [customTagError, setCustomTagError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [direction, setDirection] = useState(transitionDirection);
  const [showSelections, setShowSelections] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const expandingFrom = useRef<{ id: string; bounds: DOMRect } | null>(null);
  const activeCategory = interestCategories.find((category) => category.id === categoryId);
  const exploring = step !== 'exclude';
  const selected = exploring ? wantedTags : blockedTags;
  const selectedCount = selected.length + (exploring ? customTags.length : 0);
  const viewKey = step + '/' + (categoryId ?? '');

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [viewKey]);
  useLayoutEffect(() => {
    const previous = expandingFrom.current;
    expandingFrom.current = null;
    if (
      !previous ||
      !expandedDomains.includes(previous.id) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const card = document.getElementById('onboarding-topics-' + previous.id)?.parentElement;
    if (!card) return;
    const bounds = card.getBoundingClientRect();
    const animation = card.animate(
      [
        {
          transform: `translate(${previous.bounds.x - bounds.x}px, ${previous.bounds.y - bounds.y}px) scale(${previous.bounds.width / bounds.width}, ${previous.bounds.height / bounds.height})`,
        },
        { transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => animation.cancel();
  }, [expandedDomains]);
  const rememberCardSize = (id: string) => {
    const card = document.getElementById('onboarding-topics-' + id)?.parentElement;
    if (card && !expandedDomains.includes(id))
      expandingFrom.current = { id, bounds: card.getBoundingClientRect() };
  };
  const toggleExpansion = (id: string) => {
    rememberCardSize(id);
    setExpandedDomains((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const navigate = (action: () => void, nextDirection: 'forward' | 'backward' = 'forward') => {
    if (timer.current) return;
    setDirection(nextDirection);
    setLeaving(true);
    setShowSelections(false);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(
      () => {
        timer.current = null;
        setQuery('');
        action();
        setLeaving(false);
      },
      reduced ? 0 : 220,
    );
  };
  const back = () =>
    navigate(() => {
      if (categoryId) setCategoryId(null);
      else onStepChange(exploring ? 'intro' : 'explore');
    }, 'backward');
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((tag) => tag !== id) : [...selected, id];
    if (exploring) onWantedTagsChange(next);
    else onBlockedTagsChange(next);
  };
  const availableTags = (tags: typeof allTags) =>
    exploring ? tags : tags.filter((tag) => !wantedTags.includes(tag.id));
  const toggleDomain = (id: string, tags: typeof allTags) => {
    rememberCardSize(id);
    const ids = availableTags(tags).map((tag) => tag.id);
    const allSelected = ids.every((tag) => selected.includes(tag));
    const next = allSelected
      ? selected.filter((tag) => !ids.includes(tag))
      : [...new Set([...selected, ...ids])];
    if (exploring) onWantedTagsChange(next);
    else onBlockedTagsChange(next);
    setExpandedDomains((current) => [...new Set([...current, id])]);
  };
  const normalizedQuery = query.trim().toLowerCase();
  const addCustomTag = () => {
    const label = customTagInput.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!label) {
      setCustomTagError('Enter a tag to add.');
      return;
    }
    if (label.length > 80) {
      setCustomTagError('Keep your tag under 80 characters.');
      return;
    }
    const normalized = label.toLocaleLowerCase();
    if (
      allTags.some(
        (tag) =>
          tag.labelEn.toLocaleLowerCase() === normalized ||
          tag.label.toLocaleLowerCase() === normalized,
      ) ||
      customTags.some((tag) => tag.label.toLocaleLowerCase() === normalized)
    ) {
      setCustomTagError('That tag already exists. Pick it from your interests.');
      return;
    }
    if (customTags.length >= 12) {
      setCustomTagError('You can add up to 12 of your own tags.');
      return;
    }
    onCustomTagsChange([
      ...customTags,
      {
        id: `manual:${encodeURIComponent(normalized)}`,
        label,
        labelEn: label,
        labelZh: label,
        translationStatus: 'source_label',
        source: 'manual',
        evidenceUrl: '',
      },
    ]);
    setCustomTagInput('');
    setCustomTagError('');
    setCustomTagOpen(false);
    setQuery('');
  };
  const matches = (labels: string[]) =>
    labels.some((label) => label.toLowerCase().includes(normalizedQuery));
  const categories = interestCategories.filter(
    (category) =>
      category.domains.some((domain) => availableTags(domain.tags).length > 0) &&
      matches([
        category.labelEn,
        category.description,
        ...category.domains.flatMap((domain) => [
          domain.labelEn,
          ...domain.tags.map((tag) => tag.labelEn),
        ]),
      ]),
  );
  const subdomains =
    activeCategory?.domains.filter(
      (domain) =>
        availableTags(domain.tags).length > 0 &&
        matches([domain.labelEn, ...domain.tags.map((tag) => tag.labelEn)]),
    ) ?? [];
  const exclusionMatches = normalizedQuery
    ? interestCategories
        .flatMap((category) =>
          category.domains.flatMap((domain) =>
            domain.tags
              .filter(
                (tag) =>
                  !wantedTags.includes(tag.id) &&
                  matches([tag.labelEn, tag.label, domain.labelEn, category.labelEn]),
              )
              .map((tag) => ({ ...tag, domainLabel: domain.labelEn })),
          ),
        )
        .sort(
          (a, b) =>
            Number(b.labelEn.toLowerCase().startsWith(normalizedQuery)) -
            Number(a.labelEn.toLowerCase().startsWith(normalizedQuery)),
        )
    : [];
  const resultCount = !exploring
    ? exclusionMatches.length
    : activeCategory
      ? subdomains.length
      : categories.length;
  const firstLine =
    step === 'intro'
      ? "Now, let's"
      : !exploring
        ? 'Now, what needs'
        : activeCategory
          ? 'Follow your'
          : 'Choose a world';
  const secondLine =
    step === 'intro'
      ? 'start here.'
      : !exploring
        ? 'to get lost?'
        : activeCategory
          ? 'curiosity.'
          : 'to explore.';

  return (
    <main
      className={
        'onboarding-shell ' +
        (step === 'intro' ? 'onboarding-intro' : 'onboarding-picker-shell') +
        (exploring ? '' : ' onboarding-exclude')
      }
    >
      <div className="onboarding-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="onboarding-topbar">
        <div className="onboarding-brand" aria-label="Feed Gardener">
          <Sprout size={22} strokeWidth={1.6} />
          <span>
            feed<i>gardener</i>
          </span>
        </div>
        <span
          className="onboarding-step-indicator"
          aria-label={`Step ${step === 'intro' ? 1 : step === 'explore' ? 2 : 3} of 3`}
        >
          {step === 'intro' ? '1' : step === 'explore' ? '2' : '3'} / 3
        </span>
      </header>

      <div
        className={'onboarding-stage ' + (leaving ? 'is-leaving ' : '') + 'direction-' + direction}
        inert={leaving}
      >
        <section key={viewKey} className="onboarding-scene">
          <div className="onboarding-hero">
            {(step === 'intro' || activeCategory) && (
              <div className="onboarding-eyebrow">
                {step === 'intro' ? (
                  'A FEED WITH INTENTION'
                ) : activeCategory ? (
                  <nav aria-label="Interest categories">
                    <button
                      onClick={() =>
                        navigate(() => {
                          setCategoryId(null);
                        }, 'backward')
                      }
                    >
                      All interests
                    </button>
                    <ChevronRight size={12} />
                    <span>{activeCategory.labelEn}</span>
                  </nav>
                ) : null}
              </div>
            )}
            <h1 ref={heading} tabIndex={-1} aria-label={firstLine + ' ' + secondLine}>
              <span aria-hidden="true">
                <AnimatedWords>{firstLine}</AnimatedWords>
                <span className="onboarding-heading-accent">
                  <AnimatedWords offset={180}>{secondLine}</AnimatedWords>
                </span>
              </span>
            </h1>
            <p className="onboarding-description">
              {step === 'intro' ? (
                <>
                  Your feed should feel like a place you chose.
                  <br />
                  More of what moves you. Less of everything else.
                </>
              ) : !exploring ? (
                "Type what you wanna kick out of your feed. It's optional. Skip and we'll stick to the tags you like, leaving everything else out. You can change this later."
              ) : activeCategory ? (
                'Open a few worlds. Pick whole groups or mix the topics you love.'
              ) : (
                'Music, sport, slow mornings, big ideas. Start anywhere. Go a little deeper.'
              )}
            </p>
            {step === 'intro' && (
              <button
                className="onboarding-primary onboarding-start"
                onClick={() => navigate(() => onStepChange('explore'))}
              >
                Let's find your world <ArrowUpRight size={19} />
              </button>
            )}
          </div>

          {step !== 'intro' && (
            <>
              <div className="onboarding-catalog-bar">
                <label className="onboarding-search">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      if (event.target.value.trim() && activeCategory) {
                        setExpandedDomains((current) => [
                          ...new Set([
                            ...current,
                            ...activeCategory.domains.map((domain) => domain.id),
                          ]),
                        ]);
                      }
                    }}
                    placeholder={
                      exploring ? 'Find your interests' : 'What do you want out of your feed?'
                    }
                    aria-label={exploring ? 'Search interests' : 'Search topics to exclude'}
                  />
                  {query && (
                    <button aria-label="Clear search" onClick={() => setQuery('')}>
                      <X size={14} />
                    </button>
                  )}
                </label>
              </div>
              <div
                className={
                  'onboarding-world-grid ' +
                  (!exploring
                    ? 'onboarding-exclusion-results'
                    : activeCategory
                      ? 'onboarding-domains-grid'
                      : '')
                }
              >
                {exploring &&
                  !activeCategory &&
                  categories.map((category, index) => {
                    const Icon = categoryIcons[interestCategories.indexOf(category)] ?? Compass;
                    const count = category.domains
                      .flatMap((domain) => domain.tags)
                      .filter((tag) => selected.includes(tag.id)).length;
                    return (
                      <RevealCard index={index} hue={category.hue} key={category.id}>
                        <button
                          className={'onboarding-world-card ' + (count ? 'has-selections' : '')}
                          onClick={() => navigate(() => setCategoryId(category.id))}
                        >
                          <span className="onboarding-card-orbit" aria-hidden="true">
                            <Icon size={37} strokeWidth={1.2} />
                          </span>
                          {count > 0 && (
                            <span className="onboarding-card-count" aria-label="Selected interests">
                              <Check size={12} />
                            </span>
                          )}
                          <span className="onboarding-card-copy">
                            <strong>{category.labelEn}</strong>
                            <span>{category.description}</span>
                          </span>
                          <ArrowUpRight className="onboarding-card-arrow" size={21} />
                        </button>
                      </RevealCard>
                    );
                  })}
                {exploring &&
                  activeCategory &&
                  subdomains.map((domain, index) => {
                    const tags = availableTags(domain.tags);
                    const count = tags.filter((tag) => selected.includes(tag.id)).length;
                    const expanded = expandedDomains.includes(domain.id);
                    const shownTags =
                      normalizedQuery && !matches([domain.labelEn])
                        ? tags.filter((tag) => matches([tag.labelEn]))
                        : tags;
                    const panelId = 'onboarding-topics-' + domain.id;
                    return (
                      <RevealCard
                        key={domain.id}
                        index={index}
                        hue={activeCategory.hue + index * 22}
                        className={'onboarding-domain-reveal ' + (expanded ? 'is-expanded' : '')}
                      >
                        <div
                          className={'onboarding-domain-group ' + (expanded ? 'is-expanded' : '')}
                        >
                          <button
                            className={'onboarding-world-card ' + (count ? 'has-selections' : '')}
                            aria-expanded={expanded}
                            aria-controls={panelId}
                            aria-label={domain.labelEn}
                            onClick={() => toggleExpansion(domain.id)}
                          >
                            <span className="onboarding-card-orbit" aria-hidden="true">
                              <Sparkles size={34} strokeWidth={1.2} />
                            </span>
                            <span className="onboarding-card-copy">
                              <strong>{domain.labelEn}</strong>
                              <span>
                                {availableTags(domain.tags)
                                  .slice(0, 3)
                                  .map((tag) => tag.labelEn)
                                  .join(' · ')}
                              </span>
                            </span>
                            <ChevronDown className="onboarding-card-arrow" size={21} />
                          </button>
                          <button
                            className="onboarding-domain-select"
                            role="checkbox"
                            aria-checked={count === tags.length ? true : count ? 'mixed' : false}
                            aria-label={'All topics in ' + domain.labelEn}
                            onClick={() => toggleDomain(domain.id, domain.tags)}
                          >
                            <span aria-hidden="true">
                              {count === tags.length ? (
                                <Check size={14} />
                              ) : count ? (
                                <Minus size={14} />
                              ) : null}
                            </span>
                            {count === tags.length ? 'All selected' : 'Select all'}
                          </button>
                          <div
                            id={panelId}
                            className="onboarding-unfolded-topics"
                            hidden={!expanded}
                            role="group"
                            aria-label={domain.labelEn + ' topics'}
                          >
                            {expanded &&
                              shownTags.map((tag, tagIndex) => {
                                const chosen = selected.includes(tag.id);
                                return (
                                  <div
                                    key={tag.id}
                                    className="onboarding-child-card"
                                    style={
                                      {
                                        '--card-hue':
                                          activeCategory.hue + index * 22 + tagIndex * 3,
                                        '--topic-delay': `${30 + tagIndex * 25}ms`,
                                      } as CSSProperties
                                    }
                                  >
                                    <button
                                      className={
                                        'onboarding-world-card onboarding-unfolded-topic ' +
                                        (chosen ? 'is-selected ' : '') +
                                        (exploring ? '' : 'is-exclusion')
                                      }
                                      aria-pressed={chosen}
                                      aria-label={tag.labelEn}
                                      onClick={() => toggle(tag.id)}
                                    >
                                      <strong>{tag.labelEn}</strong>
                                      <span className="onboarding-topic-check" aria-hidden="true">
                                        {chosen ? (
                                          exploring ? (
                                            <Check size={16} />
                                          ) : (
                                            <X size={16} />
                                          )
                                        ) : null}
                                      </span>
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </RevealCard>
                    );
                  })}
                {!exploring &&
                  exclusionMatches.slice(0, 12).map((tag, index) => (
                    <div
                      key={tag.id}
                      className="onboarding-child-card"
                      style={
                        { '--card-hue': 8, '--topic-delay': `${index * 45}ms` } as CSSProperties
                      }
                    >
                      <button
                        className={
                          'onboarding-world-card onboarding-exclusion-card ' +
                          (selected.includes(tag.id) ? 'is-selected' : '')
                        }
                        aria-label={tag.labelEn}
                        aria-pressed={selected.includes(tag.id)}
                        onClick={() => toggle(tag.id)}
                      >
                        <span>{tag.domainLabel}</span>
                        <strong>{tag.labelEn}</strong>
                        <span className="onboarding-topic-check" aria-hidden="true">
                          {selected.includes(tag.id) ? <X size={18} /> : <Minus size={18} />}
                        </span>
                      </button>
                    </div>
                  ))}
              </div>
              {!exploring && !normalizedQuery && (
                <p className="onboarding-search-prompt">
                  Start typing a topic. Your favorites stay off this list.
                </p>
              )}
              {!exploring && exclusionMatches.length > 12 && (
                <p className="onboarding-search-prompt">Keep typing to narrow it down.</p>
              )}
              {resultCount === 0 && (exploring || normalizedQuery) && (
                <p className="onboarding-empty">
                  {exploring
                    ? 'No matches here. Try another word or go back to all interests.'
                    : 'No matching topics. Try another word; your favorites are already kept out.'}
                </p>
              )}
              {exploring && !activeCategory && (
                <div className="onboarding-catalog-end">
                  <Sparkles size={19} />
                  <p>You don’t have to fit into one box.</p>
                  <span>Mix a few worlds. Make this one yours.</span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {step === 'explore' && (
        <div className="onboarding-custom-tag">
          {customTagOpen && (
            <form
              className="onboarding-custom-tag-form"
              onSubmit={(event) => {
                event.preventDefault();
                addCustomTag();
              }}
            >
              <label htmlFor="onboarding-custom-tag-input">Add your own tag</label>
              <div>
                <input
                  id="onboarding-custom-tag-input"
                  autoFocus
                  value={customTagInput}
                  onChange={(event) => {
                    setCustomTagInput(event.target.value);
                    setCustomTagError('');
                  }}
                  maxLength={80}
                  placeholder="e.g. Urban gardening"
                />
                <button type="submit">Add</button>
              </div>
              {customTagError && <p role="alert">{customTagError}</p>}
            </form>
          )}
          <button
            className="onboarding-custom-tag-trigger"
            aria-expanded={customTagOpen}
            onClick={() => {
              setCustomTagOpen((value) => !value);
              setCustomTagError('');
            }}
          >
            {customTagOpen ? <X size={15} /> : <Plus size={15} />}
            {customTagOpen ? 'Close' : "Didn't find your tag? Add your own"}
          </button>
        </div>
      )}

      {step === 'intro' ? (
        <span className="onboarding-footnote">
          A few small choices. A world that feels more like you.
        </span>
      ) : (
        <footer className="onboarding-dock">
          {showSelections && (
            <div className="onboarding-selection-tray" aria-label="Selected interests">
              <div>
                <strong>{exploring ? 'Your interests' : 'Leaving out'}</strong>
                <button
                  aria-label="Close selected interests"
                  onClick={() => setShowSelections(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <div>
                {selectedCount ? (
                  <>
                    {selected.map((id) => (
                      <button
                        key={id}
                        onClick={() => toggle(id)}
                        aria-label={
                          'Remove ' + (allTags.find((tag) => tag.id === id)?.labelEn ?? id)
                        }
                      >
                        {allTags.find((tag) => tag.id === id)?.labelEn ?? id}
                        <X size={13} />
                      </button>
                    ))}
                    {exploring &&
                      customTags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() =>
                            onCustomTagsChange(customTags.filter((item) => item.id !== tag.id))
                          }
                          aria-label={'Remove ' + tag.label}
                        >
                          {tag.label} <X size={13} />
                        </button>
                      ))}
                  </>
                ) : (
                  <span>Your next favorite thing is waiting.</span>
                )}
              </div>
            </div>
          )}
          <button className="onboarding-back" aria-label="Back" onClick={back} disabled={leaving}>
            <ArrowLeft size={17} />
            <span>Back</span>
          </button>
          <button
            className="onboarding-selection-summary"
            aria-label={`${selectedCount} ${exploring ? 'interests picked' : 'topics excluded'}`}
            aria-expanded={showSelections}
            onClick={() => setShowSelections((value) => !value)}
          >
            <span className="onboarding-selection-number">{selectedCount}</span>
            <span>{exploring ? 'interests picked' : 'topics excluded'}</span>
          </button>
          <button
            className="onboarding-primary"
            disabled={leaving}
            onClick={() =>
              navigate(() =>
                exploring ? (selectedCount ? onStepChange('exclude') : onComplete()) : onComplete(),
              )
            }
          >
            {exploring
              ? selectedCount
                ? 'Next: less of this'
                : 'Explore sources first'
              : selected.length
                ? 'Enter my feed'
                : 'Skip & enter'}
            <ArrowRight size={17} />
          </button>
        </footer>
      )}
    </main>
  );
}
