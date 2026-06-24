import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.middleware.js';
import {
    createLobby, joinLobby, rejoinLobby, getLobbyInfo, getAllPlayers,
    startGame, updatePhase, killAction, healAction, voteAction,
    resetGame, leaveLobby, nightSummary, voteSummary,
    getPublicLobbies, createOnlineLobby, joinOnlineLobby,
    voteReady
} from '../controller/player.controller.js';

const playerRouter = Router();

playerRouter.get('/lobbies',                    getPublicLobbies);
playerRouter.post('/lobbies/create',            optionalAuth, createOnlineLobby);
playerRouter.post('/lobbies/join',              optionalAuth, joinOnlineLobby);
playerRouter.post('/lobby/create',              optionalAuth, createLobby);
playerRouter.post('/lobby/join',                optionalAuth, joinLobby);
playerRouter.post('/lobby/rejoin',              optionalAuth, rejoinLobby);
playerRouter.get('/lobby/:code',                getLobbyInfo);
playerRouter.get('/lobby/:code/players',        getAllPlayers);
playerRouter.post('/lobby/:code/start',         startGame);
playerRouter.post('/lobby/:code/update-phase',  updatePhase);
playerRouter.post('/lobby/:code/reset',         resetGame);
playerRouter.post('/lobby/:code/leave',         leaveLobby);
playerRouter.post('/lobby/:code/kill',          killAction);
playerRouter.post('/lobby/:code/heal',          healAction);
playerRouter.post('/lobby/:code/vote',          voteAction);
playerRouter.post('/lobby/:code/vote-ready',    voteReady);
playerRouter.get('/lobby/:code/night-summary',  nightSummary);
playerRouter.get('/lobby/:code/vote-summary',   voteSummary);

export default playerRouter;
