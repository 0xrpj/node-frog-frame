import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Button, Frog } from 'frog'
import { devtools } from 'frog/dev'
import { config } from 'dotenv';
import { createNeynar } from 'frog/middlewares'
import abi from "./abis/abi"
import axios from 'axios'

const neynar = createNeynar({ apiKey: 'NEYNAR_FROG_FM' })


config();

/*
  Constants
*/
const URL = process.env.SERVER_URL;

/*
  Types and interfaces
*/
type State = {
  txData: any;
  timestamp: number;
}


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
    image: '/src/images/screen 1.png',
    intents: [
      <Button value="homescreen" action='/tokenlist1'>Continue</Button >,
    ]
  })
})

app.frame('/tokenlist1', (c) => {
  return c.res({
    action: '/finish',
    image: '/src/images/Screen two pt1.png',
    intents: [
      <Button value="ETH" action='/eth-pick'>ETH</Button >,
      <Button value="USDC" action='/usdc-pick'>USDC</Button >,
      <Button value="TOWER" action='/tower-pick'>TOWER</Button >,
      <Button value="Next" action='/tokenlist2'>Next</Button >,
    ]
  })
})

app.frame('/tokenlist2', (c) => {
  return c.res({
    action: '/finish',
    image: '/src/images/Screen two pt2.png',
    intents: [
      <Button value="Back" action='/tokenlist1'>Back</Button >,
      <Button value="TOSHI" action='/toshi-pick'>TOSHI</Button >,
      <Button value="DEGEN" action='/degen-pick'>DEGEN</Button >,
      <Button value="Next" action='/tokenlist3'>Next</Button >,
    ]
  })
})

app.frame('/tokenlist3', (c) => {
  return c.res({
    action: '/finish',
    image: '/src/images/Screen two pt3.png',
    intents: [
      <Button value="Back" action='/tokenlist2'>Back</Button >,
      <Button value="BRETT" action='/brett-pick'>BRETT</Button >,
    ]
  })
})


app.frame('/eth-pick', (c) => {
  const { deriveState } = c

  deriveState(previousState => {
    previousState.timestamp = new Date().getTime();
  })

  return c.res({
    action: '/eth-signed',
    image: '/src/images/eth_1.png',
    intents: [
      <Button value="Back" action='/tokenlist1'>Back</Button >,
      <Button.Signature target="/sign">Sign</Button.Signature>,
    ]
  })
})

app.signature('/sign', (c) => {
  const { previousState } = c

  return c.signTypedData(
    {
      chainId: 'eip155:84532',
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

app.frame('/eth-signed', async (c) => {
  const { transactionId, deriveState, previousState } = c

  if (transactionId) {
    const address = c.var.interactor?.custodyAddress;
    if (!address) {
      return c.res({
        action: '/end',
        image: '/src/images/eth 2.png',
        intents: [
          <Button.Reset>Start Over</Button.Reset>
        ]
      })
    }

    const charId = await getARandomChar(address) as unknown as number;
    const currentTournament = await fetchCurrentTournament();
    const res = await fetchServerSignature(currentTournament, address, "Time:" + previousState.timestamp, transactionId, charId, "ETH", "0x0000000000000000000000000000000000000000")
    deriveState(previousState => {
      previousState.txData = res.data;
    })
  }

  return c.res({
    action: '/end',
    image: '/src/images/eth 2.png',
    intents: [
      <Button.Transaction target="/pay">Pay</Button.Transaction>,
      <Button.Reset>Start Over</Button.Reset>
    ]
  })
})

app.frame('/end', (c) => {
  return c.res({
    action: '/',
    image: '/src/images/end.png',
    intents: [
      <Button.Link href="https://roshanparajuli.com.np/">Join Discord</Button.Link>,
    ]
  })
})

app.transaction('/pay', (c) => {
  const { previousState } = c
  const { tournamentId, r, s, v, timestamp, nftId, amount } = previousState.txData as any;

  return c.contract({
    abi: abi.filter(({ name, inputs }) => name === 'pay' && inputs.length === 6),
    chainId: 'eip155:84532',
    functionName: 'pay',
    args: [tournamentId, r, s, v / 1, timestamp, nftId],
    to: '0x0CbA167a4AB58B7795c5765a82e65A06daE18927',
    value: BigInt(amount),
    gas: BigInt(1_500_000)
  })
})

app.frame('/tokenlist2', (c) => {
  return c.res({
    action: '/finish',
    image: '/src/images/screentwo.png',
    intents: [
      <Button.Transaction target="/mint">Join</Button.Transaction>,
    ]
  })
})

app.frame('/finish', (c) => {
  const { transactionId, } = c
  console.log({ transactionId })
  return c.res({
    image: (
      <div style={{ color: 'white', display: 'flex', fontSize: 60 }}>
        Transaction ID: {transactionId}
      </div>
    ),
    intents: [
      <Button.Transaction target="/pay">Pay</Button.Transaction>,
      <Button.Reset>Start Over</Button.Reset>,
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


const port = Number(process.env.PORT) || 3000
console.log(`Server is running on port ${port}`)

devtools(app, { serveStatic })

serve({
  fetch: app.fetch,
  port,
})
