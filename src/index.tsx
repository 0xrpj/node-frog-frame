import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Button, FrameContext, Frog, TransactionContext } from 'frog'
import { devtools } from 'frog/dev'
import { config } from 'dotenv';
import { NeynarVariables, createNeynar } from 'frog/middlewares'
import axios from 'axios'
import assetManagetAbi from "./abis/assetManagerAbi"
import erc20Abi from "./abis/erc20Abi"

config();

/*
  Constants
*/
const { NAYNAR_API_KEY, FRAME_URL, URL, DISCORD_WEBHOOK, TOURNAMENT_PAYMENT_MANAGER, DEV_TOOLS } = process.env
/*
  Types and interfaces
*/
type State = {
  txData: any;
  timestamp: number;
}

const neynar = createNeynar({ apiKey: NAYNAR_API_KEY as string })

export const app = new Frog<{ State: State }>({
  title: "GangWars Tournament!",
  hub: neynar.hub(),
  initialState: {
    txData: null,
    timestamp: 0
  }
}).use(
  neynar.middleware({ features: ['interactor', 'cast'] }),
)

app.use('/*', serveStatic({ root: './public' }))

app.frame('/', (c) => {
  return c.res({
    image: FRAME_URL + '/screen 1.png',
    intents: [
      <Button value="homescreen" action='/tokenlist1'>Continue</Button >,
    ]
  })
})

app.frame('/tokenlist1', (c) => {
  const tokenList = [
    { value: "ETH", action: '/eth-pick' },
    { value: "USDC", action: '/usdc-pick' },
    { value: "TOWER", action: '/tower-pick' },
    { value: "Next", action: '/tokenlist2' }
  ];

  return c.res({
    image: FRAME_URL + '/Screen two pt1.png',
    intents: tokenList.map(token => (
      <Button value={token.value} action={token.action}>{token.value}</Button>
    ))
  });
});

app.frame('/tokenlist2', (c) => {
  const tokenList = [
    { value: "Back", action: '/tokenlist1' },
    { value: "TOSHI", action: '/toshi-pick' },
    { value: "DEGEN", action: '/degen-pick' },
    { value: "Next", action: '/tokenlist3' }
  ];

  return c.res({
    image: FRAME_URL + '/Screen two pt2.png',
    intents: tokenList.map(token => (
      <Button value={token.value} action={token.action}>{token.value}</Button>
    ))
  });
});

app.frame('/tokenlist3', (c) => {
  const tokenList = [
    { value: "Back", action: '/tokenlist2' },
    { value: "BRETT", action: '/brett-pick' }
  ];

  return c.res({
    image: FRAME_URL + '/Screen two pt3.png',
    intents: tokenList.map(token => (
      <Button value={token.value} action={token.action}>{token.value}</Button>
    ))
  });
});

app.frame('/eth-pick', (c) => handleTokenSelection(c, 'eth'));
app.frame('/usdc-pick', (c) => handleTokenSelection(c, 'usdc'));
app.frame('/tower-pick', (c) => handleTokenSelection(c, 'tower'));
app.frame('/toshi-pick', (c) => handleTokenSelection(c, 'toshi'));
app.frame('/degen-pick', (c) => handleTokenSelection(c, 'degen'));
app.frame('/brett-pick', (c) => handleTokenSelection(c, 'brett'));

app.frame('/eth-signed', async (c) => await handleSignedTransaction(c, 'eth'));
app.frame('/usdc-signed', async (c) => await handleSignedTransaction(c, 'usdc'));
app.frame('/tower-signed', async (c) => await handleSignedTransaction(c, 'tower'));
app.frame('/toshi-signed', async (c) => await handleSignedTransaction(c, 'toshi'));
app.frame('/degen-signed', async (c) => await handleSignedTransaction(c, 'degen'));
app.frame('/brett-signed', async (c) => await handleSignedTransaction(c, 'brett'));

app.transaction('/usdc-approve', (c) => handleTokenApproval(c, 'usdc'));
app.transaction('/tower-approve', (c) => handleTokenApproval(c, 'tower'));
app.transaction('/toshi-approve', (c) => handleTokenApproval(c, 'toshi'));
app.transaction('/degen-approve', (c) => handleTokenApproval(c, 'degen'));
app.transaction('/brett-approve', (c) => handleTokenApproval(c, 'brett'));

app.frame('/usdc-approved', (c) => handleReadyForPaymentState(c, 'usdc'));
app.frame('/tower-approved', (c) => handleReadyForPaymentState(c, 'tower'));
app.frame('/toshi-approved', (c) => handleReadyForPaymentState(c, 'toshi'));
app.frame('/degen-approved', (c) => handleReadyForPaymentState(c, 'degen'));
app.frame('/brett-approved', (c) => handleReadyForPaymentState(c, 'brett'));

app.transaction('/eth-pay', (c) => handleTokenPayment(c, 'eth'));
app.transaction('/usdc-pay', (c) => handleTokenPayment(c, 'usdc'));
app.transaction('/tower-pay', (c) => handleTokenPayment(c, 'tower'));
app.transaction('/toshi-pay', (c) => handleTokenPayment(c, 'toshi'));
app.transaction('/degen-pay', (c) => handleTokenPayment(c, 'degen'));
app.transaction('/brett-pay', (c) => handleTokenPayment(c, 'brett'));

app.signature('/sign', (c) => {
  const { previousState } = c
  return c.signTypedData(
    {
      chainId: 'eip155:8453',
      types: {
        EIP712Domain: [],
        Message: [
          { name: "content", type: "string" }
        ]
      },
      primaryType: "Message",
      domain: {},
      message: {
        content: "Time:" + previousState.timestamp
      }
    })
});

app.frame('/paid', async (c) => {
  const { transactionId } = c

  if (transactionId) {
    console.log({ transactionId });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const res = (await axios.post(URL + "tournament/base/notify_join", {
      txHash: transactionId
    }, {
      validateStatus: status => (status >= 200 && status < 300) || status === 500
    }));
    await sendMessage("txhash: " + transactionId + " response: " + res.status, DISCORD_WEBHOOK as string)
  }

  return c.res({
    image: FRAME_URL + '/end.png',
    intents: [
      <Button.Link href="https://discord.gg/3xnZVUdkBy">Join Discord</Button.Link>,
    ]
  })
})

const getARandomChar = async (userAddress: string) => {
  const data = await (await fetch(URL + "market/character/claim/get?address=" + userAddress + "&limit=1")).json();
  const nftId = data.highLevel[0].nft_id;
  return nftId;
}

const fetchCurrentTournament = async () => {
  const res = (await axios.get(URL + "tournament/get_active_tournament")).data;
  return res.data.tournamentId;
}

const fetchServerSignature = async (tournamentId: number, userAddress: string, signedMessage: string, signature: string, nftId: number, token: string, tokenAddress: string) => {
  const data = {
    "tournamentId": tournamentId,
    "userAddress": userAddress,
    "signedMessage": signedMessage,
    "signature": signature,
    "nftId": nftId,
    "token": token,
    "tokenAddress": tokenAddress
  };
  console.log({ data });
  const res = (await axios.post(URL + "tournament/base/get_payment_server_sig", data)).data;
  return res;
}

function getPreviousPage(actionPrefix: string) {
  switch (actionPrefix) {
    case 'eth': return 'tokenlist1';
    case 'usdc': return 'tokenlist1';
    case 'tower': return 'tokenlist1';
    case 'toshi': return 'tokenlist2';
    case 'degen': return 'tokenlist2';
    case 'brett': return 'tokenlist3';
    default: return 'tokenlist1';
  }
}

function getTokenAddress(actionPrefix: string) {
  let tokenAddress = "0x0000000000000000000000000000000000000000";

  switch (actionPrefix) {
    case 'usdc':
      tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      break;
    case 'tower':
      tokenAddress = "0xf7C1CEfCf7E1dd8161e00099facD3E1Db9e528ee";
      break;
    case 'toshi':
      tokenAddress = "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4";
      break;
    case 'degen':
      tokenAddress = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
      break;
    case 'brett':
      tokenAddress = "0x532f27101965dd16442e59d40670faf5ebb142e4";
      break;
  }

  return tokenAddress;
}

function handleTokenSelection(c: FrameContext<{
  State: State;
} & {
  Variables: NeynarVariables;
}>, actionPrefix: string) {
  const { deriveState, previousState } = c

  deriveState(previousState => {
    previousState.timestamp = new Date().getTime();
  })

  console.log("Token selection " + `/${actionPrefix}-signed`)

  return c.res({
    action: `/${actionPrefix}-signed`,
    image: FRAME_URL + '/' + actionPrefix + ' 1.png',
    intents: [
      <Button value="Back" action={`/${getPreviousPage(actionPrefix)}`}>Back</Button>,
      <Button.Signature target="/sign">Sign</Button.Signature>,
    ]
  });
}

async function handleSignedTransaction(c: FrameContext<{
  State: State;
} & {
  Variables: NeynarVariables;
}>, actionPrefix: string) {
  const { transactionId, deriveState, previousState } = c


  // const address = "0x490bE85b2D137415dF500ECeB0ecEa61c59007b3";
  const address = c.var.interactor?.verifiedAddresses.ethAddresses[0]

  if (!address) {
    return c.res({
      image: (
        <div style={{ color: 'white', display: 'flex', fontSize: 60 }}>
          Please connect your wallet to WarpCast!
        </div>
      ),
      intents: [<Button.Reset>Start Over</Button.Reset>]
    });
  }

  const charId = await getARandomChar(address) as unknown as number;
  const currentTournament = await fetchCurrentTournament();
  const tokenAddress = getTokenAddress(actionPrefix)
  const res = await fetchServerSignature(currentTournament, address, "Time:" + previousState.timestamp, transactionId as string, charId, actionPrefix.toUpperCase(), tokenAddress)
  deriveState(previousState => {
    previousState.txData = res.data;
  })

  if (actionPrefix === "eth") {
    return c.res({
      image: FRAME_URL + '/' + actionPrefix + ' 2.png',
      action: `/paid`,
      intents: [<Button action='/tokenlist1'>Back</Button>, <Button.Transaction target={`/${actionPrefix}-pay`}> Pay</Button.Transaction >]
    });
  } else {
    return c.res({
      image: FRAME_URL + '/' + actionPrefix + ' 2.png',
      action: `/${actionPrefix}-approved`,
      intents: [<Button action='/tokenlist1'>Back</Button>, <Button.Transaction target={`/${actionPrefix}-approve`}> Approve</Button.Transaction >]
    });
  }
}

function handleReadyForPaymentState(c: FrameContext<{
  State: State;
} & {
  Variables: NeynarVariables;
}>, actionPrefix: string) {
  return c.res({
    image: FRAME_URL + '/' + actionPrefix + ' 2.png',
    action: `/paid`,
    intents: [<Button action='/tokenlist1'>Back</Button>, <Button.Transaction target={`/${actionPrefix}-pay`}> Pay</Button.Transaction >]
  });
}

function handleTokenApproval(c: TransactionContext<{
  State: State;
} & {
  Variables: NeynarVariables;
}>, actionPrefix: string) {
  const tokenAddress = getTokenAddress(actionPrefix)
  const { previousState } = c
  const { amount } = previousState.txData as any;

  return c.contract({
    abi: erc20Abi,
    chainId: 'eip155:8453',
    functionName: 'approve',
    args: [TOURNAMENT_PAYMENT_MANAGER, amount],
    to: tokenAddress as `0x${string}`,
    gas: BigInt(1_500_000)
  })
}

function handleTokenPayment(c: TransactionContext<{
  State: State;
} & {
  Variables: NeynarVariables;
}>, actionPrefix: string) {
  const { previousState } = c
  const { tournamentId, r, s, v, timestamp, nftId, amount } = previousState.txData as any;

  console.log("inside handle token payment!");

  if (actionPrefix === "eth") {
    return c.contract({
      abi: assetManagetAbi.filter(({ name, inputs }) => name === 'pay' && inputs.length === 6),
      chainId: 'eip155:8453',
      functionName: 'pay',
      args: [tournamentId, r, s, v / 1, timestamp, nftId],
      to: TOURNAMENT_PAYMENT_MANAGER as `0x${string}`,
      value: BigInt(amount),
      gas: BigInt(1_500_000)
    })
  } else {
    const tokenAddress = getTokenAddress(actionPrefix)
    return c.contract({
      abi: assetManagetAbi.filter(({ name, inputs }) => name === 'pay' && inputs.length === 8),
      chainId: 'eip155:8453',
      functionName: 'pay',
      args: [tournamentId, r, s, v / 1, tokenAddress, amount, timestamp, nftId],
      to: TOURNAMENT_PAYMENT_MANAGER as `0x${string}`,
      gas: BigInt(1_500_000)
    })
  }
}

async function sendMessage(payload: any, webhookUrl: string) {
  const data = typeof payload === 'string' ? { content: payload } : payload;

  try {
    const response = await axios.post(webhookUrl, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 204 && response.status !== 200) {
      throw new Error(`Could not send message: ${response.status}`);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}


const port = Number(process.env.PORT) || 3000
console.log(`Server is running on port ${port}`)

if (DEV_TOOLS === "enabled") {
  devtools(app, { serveStatic })
}

serve({
  fetch: app.fetch,
  port,
})
