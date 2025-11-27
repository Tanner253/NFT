import { Connection, PublicKey, Transaction, ParsedAccountData } from '@solana/web3.js'
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'

// $NFT Token Configuration
const NFT_TOKEN_MINT = new PublicKey('GT8hQV7SqRQz9TfF9oDNxcuELDmKNExtTZaTEZdHpump')
// Platform wallet - collects 100k $NFT per download
const PLATFORM_WALLET = new PublicKey('9hBGcRDL5E6UxDoDBKZJmX6T3nKwW3kZzDdHoGeJ1BFG')
const NFT_TOKEN_DECIMALS = 6 // Adjust based on your token's decimals

export interface PaymentResult {
  success: boolean
  signature?: string
  error?: string
}

/**
 * Confirm transaction using polling (no WebSocket)
 */
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  maxRetries: number = 60
): Promise<boolean> {
  let retries = 0
  
  while (retries < maxRetries) {
    try {
      const status = await connection.getSignatureStatus(signature)
      
      if (status?.value?.confirmationStatus === 'confirmed' || 
          status?.value?.confirmationStatus === 'finalized') {
        return true
      }
      
      if (status?.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      retries++
    } catch (error) {
      retries++
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return false
}

/**
 * Pay for download with $NFT tokens
 */
export async function payForDownload(
  wallet: any,
  amount: number,
  rpcUrl: string
): Promise<PaymentResult> {
  try {
    if (!wallet || !wallet.publicKey) {
      return {
        success: false,
        error: 'Wallet not connected'
      }
    }
    
    console.log('💳 Processing $NFT payment...')
    console.log(`   Amount: ${amount} $NFT`)
    console.log(`   From: ${wallet.publicKey.toBase58().slice(0, 8)}...`)
    console.log(`   To Platform: ${PLATFORM_WALLET.toBase58().slice(0, 8)}...`)
    
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
      confirmTransactionInitialTimeout: 60000,
    })
    
    // Detect if this is a Token-2022 token by checking the mint account
    const mintInfo = await connection.getAccountInfo(NFT_TOKEN_MINT)
    const isToken2022 = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
    
    console.log(`   Token Program: ${isToken2022 ? 'Token-2022' : 'Standard SPL Token'}`)
    
    // Get token accounts with correct program ID
    const fromTokenAccount = await getAssociatedTokenAddress(
      NFT_TOKEN_MINT,
      wallet.publicKey,
      false,
      tokenProgramId
    )
    
    const toTokenAccount = await getAssociatedTokenAddress(
      NFT_TOKEN_MINT,
      PLATFORM_WALLET,
      false,
      tokenProgramId
    )
    
    console.log(`   From: ${fromTokenAccount.toBase58()}`)
    console.log(`   To: ${toTokenAccount.toBase58()}`)
    
    // Convert amount to smallest unit (based on token decimals)
    const tokenAmount = Math.floor(amount * Math.pow(10, NFT_TOKEN_DECIMALS))
    console.log(`   Amount (raw): ${tokenAmount}`)
    
    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed')
    
    // Create transaction
    const transaction = new Transaction()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = wallet.publicKey
    
    // Check if platform token account exists, if not create it (user pays ~0.002 SOL)
    try {
      const toAccountInfo = await connection.getAccountInfo(toTokenAccount)
      if (!toAccountInfo) {
        console.log('   ⚠️ Creating platform token account...')
        transaction.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey, // payer
            toTokenAccount, // associated token account
            PLATFORM_WALLET, // owner
            NFT_TOKEN_MINT, // mint
            tokenProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        )
      }
    } catch (e) {
      // If we can't check, just try the transfer
      console.log('   Could not check account, will attempt transfer')
    }
    
    // Add transfer instruction with correct program ID
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        wallet.publicKey,
        tokenAmount,
        [],
        tokenProgramId
      )
    )
    
    console.log('✍️  Requesting wallet signature...')
    
    let signature: string
    
    if (!wallet.signTransaction) {
      throw new Error('Wallet does not support transaction signing')
    }
    
    // Sign transaction
    const signed = await wallet.signTransaction(transaction)
    
    console.log('✅ Transaction signed!')
    console.log('📡 Broadcasting to Solana...')
    
    // Broadcast transaction
    signature = await connection.sendRawTransaction(signed.serialize())
    
    console.log(`✅ Transaction broadcast! Signature: ${signature}`)
    
    // Confirm transaction
    const confirmResult = await confirmTransactionPolling(connection, signature, 60)
    
    if (!confirmResult) {
      console.warn('⚠️ Confirmation timeout')
      return {
        success: true,
        signature,
        error: `Payment sent but confirmation timeout. Verify at: https://solscan.io/tx/${signature}`
      }
    }
    
    console.log('✅ Payment confirmed!')
    
    return {
      success: true,
      signature
    }
  } catch (error: any) {
    console.error('❌ Payment failed:', error)
    
    let userMessage = error.message || 'Payment failed'
    
    if (error.message?.includes('User rejected') || error.message?.includes('User denied')) {
      userMessage = 'Payment cancelled by user'
    } else if (error.message?.includes('Insufficient funds')) {
      userMessage = 'Insufficient $NFT balance'
    } else if (error.message?.includes('insufficient lamports')) {
      userMessage = 'Insufficient SOL for transaction fee'
    }
    
    return {
      success: false,
      error: userMessage
    }
  }
}

/**
 * Check $NFT token balance with retry logic and alternative method
 */
export async function checkNFTBalance(
  walletAddress: string,
  requiredAmount: number,
  rpcUrl: string
): Promise<{ hasEnough: boolean; balance: number }> {
  // Try up to 3 times with backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`💰 Checking $NFT balance... (Attempt ${attempt}/3)`)
      console.log(`   Token Mint: ${NFT_TOKEN_MINT.toBase58()}`)
      console.log(`   Wallet: ${walletAddress}`)
      
      const connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: false,
      })
      
      const publicKey = new PublicKey(walletAddress)
      
      // Method 1: Try getParsedTokenAccountsByOwner (more reliable)
      try {
        console.log('   Trying getParsedTokenAccountsByOwner method...')
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { mint: NFT_TOKEN_MINT }
        )
        
        if (tokenAccounts.value.length > 0) {
          const accountData = tokenAccounts.value[0].account.data as ParsedAccountData
          const balance = accountData.parsed.info.tokenAmount.uiAmount || 0
          
          console.log(`✅ $NFT Balance: ${balance.toLocaleString()} tokens`)
          console.log(`   Required: ${requiredAmount.toLocaleString()} tokens`)
          console.log(`   Has Enough: ${balance >= requiredAmount}`)
          
          return {
            hasEnough: balance >= requiredAmount,
            balance
          }
        } else {
          console.log('   No token accounts found with this mint')
        }
      } catch (methodError: any) {
        console.warn('   Method 1 failed, trying Method 2...', methodError.message)
      }
      
      // Method 2: Try getAssociatedTokenAddress (fallback)
      const tokenAccount = await getAssociatedTokenAddress(
        NFT_TOKEN_MINT,
        publicKey
      )
      
      console.log(`   Token Account: ${tokenAccount.toBase58()}`)
      
      const tokenBalance = await connection.getTokenAccountBalance(tokenAccount)
    
      console.log(`   Raw balance data:`, tokenBalance.value)
      console.log(`   Amount: ${tokenBalance.value.amount}`)
      console.log(`   Decimals: ${tokenBalance.value.decimals}`)
      console.log(`   UI Amount: ${tokenBalance.value.uiAmount}`)
      
      const balance = tokenBalance.value.uiAmount || 0
      
      console.log(`✅ $NFT Balance: ${balance.toLocaleString()} tokens`)
      console.log(`   Required: ${requiredAmount.toLocaleString()} tokens`)
      console.log(`   Has Enough: ${balance >= requiredAmount}`)
      
      return {
        hasEnough: balance >= requiredAmount,
        balance
      }
    } catch (error: any) {
      console.error(`❌ Failed to fetch $NFT balance (Attempt ${attempt}/3)`)
      console.error('   Error:', error.message || error)
      
      if (error.message?.includes('could not find account')) {
        console.log('ℹ️ No $NFT token account found - balance is 0')
        return {
          hasEnough: false,
          balance: 0
        }
      }
      
      // If not last attempt, wait before retry
      if (attempt < 3) {
        console.log(`   Retrying in ${attempt} second(s)...`)
        await new Promise(resolve => setTimeout(resolve, attempt * 1000))
        continue
      }
      
      // Last attempt failed
      console.error('   All attempts failed')
      return {
        hasEnough: false,
        balance: 0
      }
    }
  }
  
  // Should never reach here but TypeScript needs it
  return {
    hasEnough: false,
    balance: 0
  }
}

