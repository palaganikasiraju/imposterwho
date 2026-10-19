import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { Headphones, Mic, MicOff, Copy, Users, Sparkles, ArrowRight, RotateCcw, Crown, ShieldCheck, Volume2 } from 'lucide-react';
import './styles.css';

const WORDS = {
  Animals: ['Elephant', 'Penguin', 'Giraffe', 'Dolphin', 'Kangaroo', 'Butterfly'],
  Food: ['Pizza', 'Popcorn', 'Pancakes', 'Watermelon', 'Chocolate', 'Noodles'],
  Places: ['Beach', 'School', 'Airport', 'Castle', 'Library', 'Amusement park'],
  Family: ['Birthday', 'Holiday', 'Grandma', 'Movie night', 'Picnic', 'Game night']
};

const names = ['Maya', 'Arjun', 'Priya', 'Sam'];
const funnySubjects = ['a sleepy penguin', 'grandpa’s dancing shoes', 'a talking potato', 'your family group chat', 'a confused superhero', 'a dramatic cat', 'a robot at dinner', 'a chicken with a secret', 'a very honest parrot', 'a banana in sunglasses'];
const funnySituations = ['tries to win a talent show', 'gets stuck in an elevator', 'orders food at midnight', 'becomes the family boss', 'forgets everyone’s name', 'starts a cooking channel', 'goes on a first date', 'has to give a speech', 'joins a dance battle', 'tries to act mysterious', 'loses the remote control', 'opens a tiny shop', 'gets invited to a wedding', 'becomes a school teacher', 'tries to tell a joke', 'finds a magic button', 'goes camping for the first time', 'gets a surprise birthday party', 'becomes a detective', 'tries to hide a giant surprise', 'has to babysit ten puppies', 'gets locked inside a supermarket', 'starts a rock band', 'takes a selfie for the first time', 'tries to catch a flying sandwich', 'is late for an important meeting', 'wins a very strange trophy', 'tries to impress the neighbours', 'gets interviewed on TV', 'becomes famous for one day'];
const QUESTIONS = funnySubjects.flatMap((subject) => funnySituations.map((situation) => `What would ${subject} do when it ${situation}?`));
const IMPOSTER_MISSIONS = ['Act normal, potato!', 'Be sneaky like a sleepy cat.', 'Copy the family genius.', 'Look innocent. Wiggle less.', 'Hide in plain sight, banana.', 'Give clues like a confused detective.', 'Stay cool, tiny chicken.', 'Pretend you know everything.', 'Use your best poker face.', 'Be mysterious, but not too mysterious.', 'Listen like a wise owl.', 'Survive the clue parade.', 'Smile like you know the secret.', 'Act casual, superstar.', 'Do not panic like a squirrel.'];
const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
const socket = io(SOCKET_URL, { autoConnect: true });

function makeRoom() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function App() {
  const [screen, setScreen] = useState('home');
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([]);
  const [category, setCategory] = useState('Animals');
  const [rounds, setRounds] = useState(3);
  const [round, setRound] = useState(1);
  const [turn, setTurn] = useState(0);
  const [roles, setRoles] = useState({});
  const [word, setWord] = useState('');
  const [question, setQuestion] = useState('');
  const [mission, setMission] = useState(IMPOSTER_MISSIONS[0]);
  const [votes, setVotes] = useState({});
  const [myVote, setMyVote] = useState('');
  const [micOn, setMicOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scores, setScores] = useState({});
  const [notice, setNotice] = useState('');
  const [myId, setMyId] = useState('');
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState({});

  const currentPlayer = players[turn];
  const isMyTurn = currentPlayer?.name === name;
  const imposter = players.find((player) => roles[player.name] === 'imposter');
  const winningVote = useMemo(() => {
    const counts = Object.values(votes).reduce((result, player) => ({ ...result, [player]: (result[player] || 0) + 1 }), {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [votes]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const connected = () => setMyId(socket.id);
    const roomUpdated = (room) => { setRoomCode(room.code); setPlayers(room.players); };
    const roleReceived = ({ role, word: receivedWord }) => { setRoles((current) => ({ ...current, [name]: role })); setWord(receivedWord || ''); setScreen('role'); };
    const gameState = ({ currentPlayerId, question: serverQuestion }) => { if (serverQuestion) setQuestion(serverQuestion); setTurn((current) => { const next = players.findIndex((player) => player.id === currentPlayerId); return next < 0 ? current : next; }); };
    const votingStarted = () => setScreen('voting');
    const resultsReceived = ({ imposterId, word: resultWord, caught, votes: serverVotes }) => {
      const imposterPlayer = players.find((player) => player.id === imposterId);
      if (imposterPlayer) setRoles((current) => ({ ...current, [imposterPlayer.name]: 'imposter' }));
      setWord(resultWord); setVotes(Object.fromEntries(Object.entries(serverVotes || {}).map(([voterId, targetId]) => [players.find((p) => p.id === voterId)?.name || voterId, players.find((p) => p.id === targetId)?.name || targetId]))); setScreen('results');
      setNotice(caught ? 'The family caught the imposter!' : 'The imposter escaped!');
    };
    const createPeer = (peerId, initiator) => {
      if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      localStreamRef.current?.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));
      peer.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('webrtc:ice', { targetId: peerId, candidate }); };
      peer.ontrack = ({ streams }) => { if (streams[0]) setRemoteStreams((current) => ({ ...current, [peerId]: streams[0] })); };
      peer.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) { peer.close(); peersRef.current.delete(peerId); setRemoteStreams((current) => { const next = { ...current }; delete next[peerId]; return next; }); } };
      peersRef.current.set(peerId, peer);
      if (initiator) peer.createOffer().then((offer) => peer.setLocalDescription(offer)).then(() => socket.emit('webrtc:offer', { targetId: peerId, offer: peer.localDescription }));
      return peer;
    };
    const offerReceived = async ({ fromId, offer }) => { const peer = createPeer(fromId, false); await peer.setRemoteDescription(offer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); socket.emit('webrtc:answer', { targetId: fromId, answer }); };
    const answerReceived = async ({ fromId, answer }) => { const peer = peersRef.current.get(fromId); if (peer) await peer.setRemoteDescription(answer); };
    const iceReceived = async ({ fromId, candidate }) => { const peer = peersRef.current.get(fromId); if (peer && candidate) await peer.addIceCandidate(candidate).catch(() => {}); };
    socket.on('connect', connected); socket.on('room:update', roomUpdated); socket.on('game:role', roleReceived); socket.on('game:state', gameState); socket.on('game:voting', votingStarted); socket.on('game:results', resultsReceived); socket.on('webrtc:offer', offerReceived); socket.on('webrtc:answer', answerReceived); socket.on('webrtc:ice', iceReceived);
    return () => { socket.off('connect', connected); socket.off('room:update', roomUpdated); socket.off('game:role', roleReceived); socket.off('game:state', gameState); socket.off('game:voting', votingStarted); socket.off('game:results', resultsReceived); socket.off('webrtc:offer', offerReceived); socket.off('webrtc:answer', answerReceived); socket.off('webrtc:ice', iceReceived); };
  }, [name, players]);

  useEffect(() => {
    if (!micOn || !localStreamRef.current || !myId) return;
    players.filter((player) => player.id && player.id !== myId).forEach((player) => {
      let peer = peersRef.current.get(player.id);
      if (!peer) {
        peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peer.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('webrtc:ice', { targetId: player.id, candidate }); };
        peer.ontrack = ({ streams }) => { if (streams[0]) setRemoteStreams((current) => ({ ...current, [player.id]: streams[0] })); };
        peersRef.current.set(player.id, peer);
      }
      const senders = peer.getSenders();
      localStreamRef.current.getTracks().forEach((track) => { if (!senders.some((sender) => sender.track?.id === track.id)) peer.addTrack(track, localStreamRef.current); });
      if (myId < player.id && peer.signalingState === 'stable') peer.createOffer().then((offer) => peer.setLocalDescription(offer)).then(() => socket.emit('webrtc:offer', { targetId: player.id, offer: peer.localDescription }));
    });
  }, [micOn, myId, players]);

  function startRoom(join = false) {
    if (!name.trim()) return setNotice('Enter your name first');
    if (join && roomCode.trim().length < 4) return setNotice('Enter a valid 4-digit room code');
    const event = join ? 'room:join' : 'room:create';
    const payload = join ? { code: roomCode.trim(), name: name.trim() } : { name: name.trim() };
    socket.emit(event, payload, (response) => { if (!response?.ok) return setNotice(response?.error === 'Room not found' ? 'This room expired. Create a new room and share the new code.' : response?.error || 'Could not enter room'); setScreen('lobby'); });
  }

  function copyRoom() {
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function beginGame() {
    const chosenWord = WORDS[category][Math.floor(Math.random() * WORDS[category].length)];
    setQuestion(QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]);
    setMission(IMPOSTER_MISSIONS[Math.floor(Math.random() * IMPOSTER_MISSIONS.length)]);
    if (players.length < 2) return setNotice('Add at least 2 family members before starting');
    socket.emit('game:start', { roomCode, settings: { category, rounds, word: chosenWord, question } }, (response) => { if (!response?.ok) setNotice(response?.error || 'Only the host can start'); });
  }

  async function toggleMic() {
    if (!micOn && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        localStreamRef.current = stream;
        setMicOn(true);
      } catch {
        setNotice('Microphone permission was not granted');
      }
    } else { localStreamRef.current?.getTracks().forEach((track) => track.stop()); setMicOn(false); }
  }

  function finishTurn() {
    if (!isMyTurn) return setNotice(`It is ${currentPlayer.name}'s turn`);
    socket.emit('game:next', { roomCode }, (response) => { if (!response?.ok) setNotice(response?.error || 'Please wait for your turn'); });
  }

  function submitVote() {
    if (!myVote) return setNotice('Choose a player to vote for');
    const target = players.find((player) => player.name === myVote);
    socket.emit('vote:submit', { roomCode, targetId: target?.id });
    setNotice('Vote sent. Waiting for the family...');
  }

  function nextRound() {
    if (round >= rounds) return setScreen('final');
    setRound(round + 1);
    beginGame();
  }

  function reset() {
    setScreen('home'); setRoomCode(''); setPlayers([]); setRound(1); setRoles({}); setVotes({}); setScores({}); setMicOn(false);
  }

  const callPanel = <aside className="call-panel">
    <div className="call-title"><span className="live-dot" /> Family call <span className="call-count"><Users size={14} /> {players.length}</span></div>
    <div className="avatar-row">{players.map((player, index) => <div className="avatar-wrap" key={player.name}><div className={`avatar hue-${index}`}>{player.name[0]}</div><span>{player.name}</span></div>)}</div>
    <div className="call-actions"><button className={micOn ? 'icon-button active' : 'icon-button'} onClick={toggleMic}>{micOn ? <Mic size={17} /> : <MicOff size={17} />}</button><span>{micOn ? 'Mic on' : 'Join audio'}</span><button className="icon-button"><Volume2 size={17} /></button></div>
    <div className="remote-audio">{Object.entries(remoteStreams).map(([peerId, stream]) => <audio key={peerId} autoPlay ref={(element) => { if (element) element.srcObject = stream; }} />)}</div>
    <p className="call-note"><Headphones size={14} /> {micOn ? (Object.keys(remoteStreams).length ? `Audio connected with ${Object.keys(remoteStreams).length} player(s).` : 'Mic is on. Waiting for another player to join audio.') : 'Tap Join audio and allow microphone access.'}</p>
  </aside>;

  const steps = [{ id: 'lobby', label: 'Join' }, { id: 'role', label: 'Secret' }, { id: 'turn', label: 'Clues' }, { id: 'voting', label: 'Vote' }, { id: 'results', label: 'Result' }];
  const stepIndex = Math.max(0, steps.findIndex((step) => step.id === screen));
  const stepBar = screen !== 'home' && screen !== 'final' ? <div className="step-bar">{steps.map((step, index) => <div className={`step ${index <= stepIndex ? 'done' : ''} ${index === stepIndex ? 'current' : ''}`} key={step.id}><span>{index < stepIndex ? '✓' : index + 1}</span><small>{step.label}</small></div>)}</div> : null;
  const questionCard = question && screen !== 'home' && screen !== 'lobby' && screen !== 'final' ? <div className="question-card global-question"><span>FUNNY QUESTION FOR THIS ROUND</span><strong>{question}</strong></div> : null;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Sparkles size={17} /></span> imposter <em>who?</em></div>{screen !== 'home' && <button className="quiet-button" onClick={reset}>Leave room</button>}</header>
    {notice && <div className="toast">{notice}</div>}
    {stepBar}
    {questionCard}
    {screen === 'home' && <main className="center-page home-page"><div className="eyebrow">THE FAMILY PARTY GAME</div><h1>Who is hiding<br /><span>in plain sight?</span></h1><p className="lead">Give clever clues, listen closely, and catch the imposter before they catch you.</p><div className="home-cards"><section className="card action-card"><div className="card-icon purple"><Sparkles /></div><h2>Create a room</h2><p>Start a private game and invite your family.</p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={18} /><button className="primary-button" onClick={() => startRoom(false)}>Create room <ArrowRight size={17} /></button></section><section className="card action-card"><div className="card-icon orange"><Users /></div><h2>Join a room</h2><p>Enter the code shared by your family.</p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={18} /><input value={roomCode} onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit room code" inputMode="numeric" /><button className="secondary-button" onClick={() => startRoom(true)}>Join room <ArrowRight size={17} /></button></section></div><div className="how"><ShieldCheck size={17} /> No accounts needed · Family-friendly · Play in minutes</div></main>}
    {screen === 'lobby' && <main className="game-layout"><div className="main-column"><div className="eyebrow">ROOM READY</div><h1>Invite your family.</h1><p className="lead">Share the room code, then choose your game settings.</p><div className="room-code"><span>{roomCode}</span><button onClick={copyRoom}>{copied ? 'Copied!' : <><Copy size={16} /> Copy code</>}</button></div><section className="card settings"><div><label>Category</label><select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.keys(WORDS).map((key) => <option key={key}>{key}</option>)}</select></div><div><label>Rounds</label><select value={rounds} onChange={(e) => setRounds(Number(e.target.value))}><option value={1}>1 round</option><option value={3}>3 rounds</option><option value={5}>5 rounds</option></select></div></section><button className="primary-button wide" onClick={beginGame}>Start game <ArrowRight size={17} /></button></div><div className="side-column"><section className="card player-card"><div className="section-heading"><h3><Users size={18} /> Players</h3><span>{players.length} joined</span></div>{players.map((player, index) => <div className="player-line" key={player.name}><div className={`avatar small hue-${index}`}>{player.name[0]}</div><span>{player.name}{player.name === name && <small>you</small>}</span>{player.isHost && <Crown size={15} className="crown" />}</div>)}</section>{callPanel}</div></main>}
    {screen === 'role' && <main className="game-layout"><div className="main-column"><div className="progress"><span>ROUND {round} / {rounds}</span><span>ROLE REVEAL</span></div><div className="role-card"><div className="role-symbol">{roles[name] === 'imposter' ? '◉' : '✦'}</div><div className="eyebrow">YOUR SECRET ROLE</div><h1>{roles[name] === 'imposter' ? 'You are the imposter.' : 'You are a player.'}</h1><p>{roles[name] === 'imposter' ? 'Listen carefully and follow your funny mission.' : 'You know the secret word. Give a clue that helps your family, but not the imposter.'}</p>{roles[name] === 'player' && <div className="secret-word"><span>YOUR WORD</span><strong>{word}</strong></div>}{roles[name] === 'imposter' && <div className="secret-word imposter-word"><span>YOUR FUNNY MISSION</span><strong>{mission}</strong></div>}<button className="primary-button" onClick={() => setScreen('turn')}>I’m ready <ArrowRight size={17} /></button></div></div><div className="side-column">{callPanel}</div></main>}
    {screen === 'turn' && <main className="game-layout"><div className="main-column"><div className="progress"><span>ROUND {round} / {rounds}</span><span>CLUES · {turn + 1} OF {players.length}</span></div><section className={`turn-card ${isMyTurn ? 'my-turn' : ''}`}><div className={`turn-avatar avatar hue-${turn % 4}`}>{currentPlayer?.name?.[0]}</div><div className="eyebrow">{isMyTurn ? 'YOUR TURN' : 'LISTENING NOW'}</div><h1>{isMyTurn ? 'Give your clue.' : `${currentPlayer?.name} is speaking.`}</h1><p>{isMyTurn ? 'Say one clue out loud, then tap Next when you are done.' : 'Listen closely. You can discuss clues together before moving on.'}</p><div className="turn-word">{isMyTurn && roles[name] === 'player' ? <><span>Your word</span><strong>{word}</strong></> : isMyTurn ? <><span>Your funny mission</span><strong>{mission}</strong></> : <><span>Current speaker</span><strong>{currentPlayer?.name}</strong></>}</div><button className="primary-button" onClick={finishTurn}>{isMyTurn ? <>I’m done — Next <ArrowRight size={17} /></> : <>Wait for my turn <Mic size={17} /></>}</button></section></div><div className="side-column">{callPanel}<section className="card order-card"><div className="section-heading"><h3>Speaking order</h3></div>{players.map((player, index) => <div className={`order-line ${index === turn ? 'current' : ''}`} key={player.name}><span>{index + 1}</span>{player.name}{index === turn && <small>speaking</small>}</div>)}</section></div></main>}
    {screen === 'voting' && <main className="game-layout"><div className="main-column"><div className="eyebrow">EVERYONE HAS SPOKEN</div><h1>Who is the imposter?</h1><p className="lead">Talk it out in the family call, then cast your vote.</p><section className="card vote-card">{players.filter((player) => player.name !== name).map((player, index) => <button className={`vote-option ${myVote === player.name ? 'selected' : ''}`} key={player.name} onClick={() => setMyVote(player.name)}><div className={`avatar small hue-${index}`}>{player.name[0]}</div><span>{player.name}</span>{myVote === player.name && <ShieldCheck size={18} />}</button>)}<button className="primary-button wide" onClick={submitVote}>Lock in vote <ArrowRight size={17} /></button></section></div><div className="side-column">{callPanel}</div></main>}
    {screen === 'results' && <main className="center-page results-page"><div className="eyebrow">ROUND {round} RESULTS</div><div className="result-icon">◉</div><h1>{winningVote === imposter?.name ? 'Great detective work!' : 'The imposter escaped!'}</h1><p className="lead">The imposter was <strong>{imposter?.name}</strong>. The secret word was <strong>{word}</strong>.</p><section className="card result-card">{players.map((player) => <div className="result-line" key={player.name}><div className={`avatar small hue-${players.indexOf(player)}`}>{player.name[0]}</div><span>{player.name}{player.name === imposter?.name && <em>IMPOSTER</em>}</span><strong>{votes[player.name] ? `voted ${votes[player.name]}` : 'No vote'}</strong></div>)}</section><button className="primary-button" onClick={nextRound}>{round >= rounds ? 'See final scores' : 'Next round'} <ArrowRight size={17} /></button></main>}
    {screen === 'final' && <main className="center-page results-page"><div className="eyebrow">GAME COMPLETE</div><div className="result-icon winner">✦</div><h1>That was a close one!</h1><p className="lead">Thanks for playing, {players.map((p) => p.name).join(', ')}.</p><section className="card result-card"><div className="section-heading"><h3>Final scores</h3></div>{players.map((player, index) => <div className="result-line" key={player.name}><div className={`avatar small hue-${index}`}>{player.name[0]}</div><span>{player.name}</span><strong>{(scores[player.name] || (index === 0 ? 8 : 5))} pts</strong></div>)}</section><button className="primary-button" onClick={reset}><RotateCcw size={17} /> Play again</button></main>}
    <footer>imposter who? <span>made for memorable family nights</span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
