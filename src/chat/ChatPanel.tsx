import { Button, Card, CardBody, CardHeader, CardTitle, Content, Flex, FlexItem, Label, Spinner, Stack } from '@patternfly/react-core';
import PenToSquareIcon from '@patternfly/react-icons/dist/esm/icons/pen-to-square-icon';
import TimesIcon from '@patternfly/react-icons/dist/esm/icons/times-icon';
import MinusIcon from '@patternfly/react-icons/dist/esm/icons/minus-icon';
import HistoryIcon from '@patternfly/react-icons/dist/esm/icons/history-icon';
import ChatbotConversationHistoryNav from '@patternfly/chatbot/dist/dynamic/ChatbotConversationHistoryNav';
import Chatbot, { ChatbotDisplayMode } from '@patternfly/chatbot/dist/dynamic/Chatbot';
import ChatbotContent from '@patternfly/chatbot/dist/dynamic/ChatbotContent';
import ChatbotFooter, { ChatbotFootnote } from '@patternfly/chatbot/dist/dynamic/ChatbotFooter';
import ChatbotHeader, { ChatbotHeaderActions, ChatbotHeaderMain, ChatbotHeaderTitle } from '@patternfly/chatbot/dist/dynamic/ChatbotHeader';
import ChatbotWelcomePrompt from '@patternfly/chatbot/dist/dynamic/ChatbotWelcomePrompt';
import Message from '@patternfly/chatbot/dist/dynamic/Message';
import MessageBar from '@patternfly/chatbot/dist/dynamic/MessageBar';
import MessageBox from '@patternfly/chatbot/dist/dynamic/MessageBox';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../chrome/useMediaQuery';
import { product } from '../config/product';
import type { AskResult, ObjectSummary } from '../data/client';
import { useObjectPanel } from '../objects/ObjectPanelProvider';
import { usePrincipal } from '../principal/PrincipalProvider';
import { routeHref } from '../routing';
import { useProcesses } from '../processes/ProcessProvider';
import { BUILT_ARCHETYPES } from '../views/composeView';
import { nameOf, useChat, type ChatAbout, type ChatTurn } from './ChatProvider';
import './ChatPanel.css';

/** Prompts that work in any domain (design system spec 4.1, Ask). */
const PROMPTS = ['What needs me first today?', 'What is overdue or due this week?', 'Summarize the work waiting for me.'];

/** Prompts about one object, in any domain (design system spec 4.1, Ask about this). */
const promptsAbout = (identifier: string) => [`Summarize ${identifier}`, `What can I do next on ${identifier}, and why?`, `What is ${identifier} linked to?`];

/** Prompts about the chosen objects, in any domain (design system spec 4.1, About the chosen). */
const promptsAboutMany = (count: number) => [`Summarize these ${count}`, 'How do they differ?', 'What can I do next on them, and why?'];

/** From PatternFly's lg breakpoint up, the panel sits beside the page; below it, over it. */
export const SIDE_BY_SIDE = '(min-width: 992px)';

/**
 * The chat panel (design system spec 4.1, Ask): PatternFly's chatbot, docked at the right beside the page from lg up,
 * over it below lg, and the whole screen below md. A conversation with the platform through the gateway's Ask.
 */
export function ChatPanel() {
  const chat = useChat();
  const { name } = usePrincipal();
  const panel = useObjectPanel();
  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  const roomy = useMediaQuery('(min-width: 768px)');
  const end = useRef<HTMLDivElement>(null);
  const processes = useProcesses();
  const mode = roomy ? ChatbotDisplayMode.docked : ChatbotDisplayMode.fullscreen;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const historyButton = useRef<HTMLButtonElement>(null);
  // The history closes when the chat does.
  useEffect(() => {
    if (!chat.isOpen) setHistoryOpen(false);
  }, [chat.isOpen]);
  const firstName = name.trim().split(/\s+/)[0];

  // The latest message stays in view as the conversation grows.
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [chat.turns]);

  // Over the page, opening an object or the search page closes the chat, keeping the conversation, so it can be read.
  const leave = () => {
    if (!sideBySide) chat.close();
  };
  const open = (object: ObjectSummary) => (event: React.MouseEvent) => {
    event.preventDefault();
    panel.open(object.iri);
    leave();
  };
  const sources = (objects: ObjectSummary[]) =>
    objects.length
      ? {
          sources: {
            // Like an object list's cards: the identifier and type in small text, then the title (design system spec 4.3).
            sources: objects.map((o) => ({
              headerContent: <small className="app-chat__eyebrow">{`${o.identifier} · ${o.typeLabel}`}</small>,
              title: o.title,
              link: '#',
              onClick: open(o),
            })),
            // Every cited object at once, one card under another and as wide as the conversation, like an object list.
            layout: 'wrap' as const,
            cardMaxWidth: '100%',
            sourceWord: 'object',
            sourceWordPlural: 'objects',
          },
        }
      : {};

  /**
   * The object a conversation is about, leading it as an object list's card does: its identifier and type, its title,
   * which opens it, its state, and the methods the person can run on it now, which run as they do anywhere.
   */
  const aboutCard = ({ object, methods }: ChatAbout, one = true) => {
    // About several, the cards are dense: no methods, which the list's batch actions run, and no state (design system spec 4.1, About the chosen).
    const runnable = one ? methods.filter((m) => m.available && BUILT_ARCHETYPES.has(m.archetype.label)) : [];
    return (
      <Card key={object.iri} className="app-chat__about" isCompact>
        <CardHeader>
          <Content component="small">{`${object.identifier} · ${object.typeLabel}`}</Content>
          <CardTitle component="h3">
            <Button variant="link" isInline component="a" href="#" onClick={open(object)}>
              {object.title}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
            {one && (
              <Flex gap={{ default: 'gapSm' }}>
                {Object.entries(object.state)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([dimension, value]) => (
                    <FlexItem key={dimension}>
                      <Label color="grey" variant="outline" isCompact>{`${dimension}: ${value}`}</Label>
                    </FlexItem>
                  ))}
              </Flex>
            )}
            {runnable.length > 0 && (
              <>
                <Content component="small">You can:</Content>
                <Flex gap={{ default: 'gapSm' }}>
                  {runnable.map((m) => (
                    <FlexItem key={m.method}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          processes.open({ object: object.iri, objectIdentifier: object.identifier, method: m.method, label: m.label, archetype: m.archetype.label });
                          leave();
                        }}
                      >
                        {m.label}
                      </Button>
                    </FlexItem>
                  ))}
                </Flex>
              </>
            )}
          </Flex>
        </CardBody>
      </Card>
    );
  };

  // The welcome and message bar: general, about one object, or about the chosen (design system spec 4.1).
  const [first] = chat.about;
  const welcome =
    chat.about.length > 1
      ? { title: `Ask about these ${chat.about.length}`, description: chat.about.map((a) => a.object.identifier).join(', '), prompts: promptsAboutMany(chat.about.length), placeholder: `Ask about these ${chat.about.length}` }
      : first
        ? { title: `Ask about ${first.object.identifier}`, description: first.object.title, prompts: promptsAbout(first.object.identifier), placeholder: `Ask about ${first.object.identifier}` }
        : { title: 'Search or ask anything', description: 'Find objects, or ask about the work you may see.', prompts: PROMPTS, placeholder: 'Search or ask' };

  const reply = (turn: ChatTurn) => {
    const common = {
      role: 'bot' as const,
      name: product.name,
      isAvatarHidden: true,
    };
    if (turn.status === 'waiting') return <Message key={`r${turn.id}`} {...common} isLoading content="" loadingWord="Working on it" />;
    if (turn.status === 'failed') {
      return (
        <Message
          key={`r${turn.id}`}
          {...common}
          content=""
          error={{
            title: 'This could not be answered',
            children: turn.reasons?.join(' '),
            variant: 'danger',
          }}
        />
      );
    }
    const result = turn.result as AskResult;
    if (result.answer) {
      const { answer } = result;
      return (
        <Message
          key={`r${turn.id}`}
          {...common}
          content={answer.text}
          {...sources(answer.cited)}
          extraContent={{
            afterMainContent: (
              <small className="app-chat__note">{`Answered by ${answer.model}, after looking at ${answer.lookedAt} ${answer.lookedAt === 1 ? 'object' : 'objects'}.`}</small>
            ),
          }}
        />
      );
    }
    const search = result.search!;
    // About an object, without a model, the reply is the object itself (platform spec 5.2, About an object).
    if (chat.about.length) {
      return <Message key={`r${turn.id}`} {...common} content={result.searched ?? ''} {...sources(search.results.map((r) => r.object))} />;
    }
    const found = search.total
      ? `Here is what a search found for “${search.query}”: ${search.total} ${search.total === 1 ? 'match' : 'matches'}.`
      : 'Nothing matches. Try fewer words, a type such as “queries”, a state such as “open”, or an identifier such as SC-003.';
    return (
      <Message
        key={`r${turn.id}`}
        {...common}
        content={[result.searched, found].filter(Boolean).join(' ')}
        {...sources(search.results.slice(0, 5).map((r) => r.object))}
        extraContent={
          search.total
            ? {
                afterMainContent: (
                  <Button variant="link" isInline component="a" href={routeHref({ name: 'search', query: search.query })} onClick={leave}>
                    {`See all ${search.total} on the search page`}
                  </Button>
                ),
              }
            : undefined
        }
      />
    );
  };

  return (
    <Chatbot displayMode={mode} isVisible={chat.isOpen} ariaLabel="Ask" className="app-chat">
      {chat.isOpen && (
        <div
          id="app-chat"
          className="app-chat__frame"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            // Escape closes the history first, then the chat.
            if (historyOpen) {
              setHistoryOpen(false);
              historyButton.current?.focus();
            } else chat.close();
          }}
        >
          {/* The person's conversations, newest first (design system spec 4.1, Conversations and their history). */}
          <ChatbotConversationHistoryNav
            displayMode={mode}
            isDrawerOpen={historyOpen}
            setIsDrawerOpen={setHistoryOpen}
            onDrawerToggle={() => setHistoryOpen((o) => !o)}
            activeItemId={chat.currentId}
            onSelectActiveItem={(_event, id) => {
              chat.select(String(id));
              setHistoryOpen(false);
            }}
            conversations={chat.conversations
              .filter((c) => !historyFilter.trim() || nameOf(c).toLowerCase().includes(historyFilter.trim().toLowerCase()))
              .map((c) => ({ id: c.id, text: nameOf(c), noIcon: true }))}
            newChatButtonText="New conversation"
            onNewChat={() => {
              chat.newConversation();
              setHistoryOpen(false);
            }}
            handleTextInputChange={setHistoryFilter}
            searchInputPlaceholder="Search conversations"
            searchInputAriaLabel="Search conversations"
            title="Conversations"
            drawerContent={
              <div className="app-chat__body">
                <ChatbotHeader>
                  <ChatbotHeaderMain>
                    <Button
                      ref={historyButton}
                      variant="plain"
                      icon={<HistoryIcon />}
                      aria-label="Conversations"
                      aria-expanded={historyOpen}
                      onClick={() => setHistoryOpen((o) => !o)}
                    />
                    <ChatbotHeaderTitle>
                      <h2 className="app-chat__title">Ask</h2>
                    </ChatbotHeaderTitle>
                  </ChatbotHeaderMain>
                  <ChatbotHeaderActions>
                    {/* Plain icon buttons, like the masthead's (design system spec 1, Visual style). */}
                    <Button variant="plain" icon={<PenToSquareIcon />} aria-label="New conversation" onClick={chat.newConversation} />
                    {/* Sets the conversation aside in the dock, immediately left of Close as on every process (design system spec 4.1). */}
                    <Button variant="plain" icon={<MinusIcon />} aria-label="Minimize" onClick={chat.minimize} />
                    <Button variant="plain" icon={<TimesIcon />} aria-label="Close" onClick={chat.close} />
                  </ChatbotHeaderActions>
                </ChatbotHeader>
                {/* The conversation and the message bar on the content surface, inset like the content area. */}
                <div className="app-chat__surface">
                  <ChatbotContent>
                    <MessageBox ariaLabel="Conversation">
                      {chat.aboutLoading && <Spinner size="lg" aria-valuetext="Reading the objects" />}
                      {chat.about.length === 1 && aboutCard(chat.about[0])}
                      {chat.about.length > 1 && (
                        <Stack hasGutter className="app-chat__about-many" data-count={chat.about.length}>
                          {chat.about.map((a) => aboutCard(a, false))}
                        </Stack>
                      )}
                      {chat.turns.length === 0 && !chat.aboutLoading && (
                        // The chat's own welcome, not To do's greeting; about objects, theirs (design system spec 4.1).
                        <ChatbotWelcomePrompt
                          title={welcome.title}
                          description={welcome.description}
                          prompts={welcome.prompts.map((p) => ({
                            title: p,
                            onClick: () => chat.send(p),
                          }))}
                        />
                      )}
                      {chat.turns.flatMap((turn) => [<Message key={`q${turn.id}`} role="user" name={firstName} isAvatarHidden content={turn.question} />, reply(turn)])}
                      <div ref={end} />
                    </MessageBox>
                  </ChatbotContent>
                  <ChatbotFooter>
                    <MessageBar
                      onSendMessage={(m) => chat.send(String(m))}
                      placeholder={welcome.placeholder}
                      hasAttachButton={false}
                      alwayShowSendButton
                    />
                    <ChatbotFootnote label="Answers come from what you may read. Check them before you act." />
                  </ChatbotFooter>
                </div>
              </div>
            }
          />
        </div>
      )}
    </Chatbot>
  );
}
