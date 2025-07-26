import React, { useState, useRef, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import {
  useSignAndExecuteTransaction,
  ConnectButton,
  useCurrentAccount,
  useCurrentWallet
} from '@mysten/dapp-kit';
import './app.css';

// Initialize SuiClient for RPC calls
const suiClient = new SuiClient({ url: getFullnodeUrl('devnet') });

const NFTPreview = ({ imageUrl, name, description, attributes }) => {
  return (
    <div className="nft-preview">
      <h2 className="section-title">NFT Preview</h2>
      <div className="card">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="NFT Preview"
            className="preview-image"
            onError={(e) => {
              e.target.src = 'https://via.placeholder.com/300?text=Invalid+Image';
            }}
          />
        ) : (
          <div className="preview-placeholder">
            <span>No Image Provided</span>
          </div>
        )}
        <h3 className="preview-title">{name || 'Unnamed NFT'}</h3>
        <p className="preview-description">{description || 'No description provided'}</p>
        {attributes && attributes.length > 0 ? (
          <div className="attributes">
            <h4 className="preview-subtitle">Attributes</h4>
            <ul className="attribute-list">
              {attributes.map((attr, index) => (
                <li key={index} className="attribute-item">
                  <strong>{attr.trait_type}:</strong> {attr.value}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="preview-description">No attributes provided</p>
        )}
      </div>
    </div>
  );
};

const MyNFTs = ({ account, packageId, onTransfer }) => {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNFTs = async () => {
      if (!account) return;
      setLoading(true);
      setError(null);
      try {
        const objects = await suiClient.getOwnedObjects({
          owner: account.address,
          filter: { StructType: `${packageId}::loyalty_card::Loyalty` },
          options: { showContent: true }
        });
        const nftData = objects.data.map(obj => {
          const content = obj.data.content.fields;
          return {
            id: obj.data.objectId,
            imageUrl: content.image_url,
            name: content.name,
            description: content.description,
            attributes: Object.entries(content.attributes.fields.contents).map(([key, value]) => ({
              trait_type: key,
              value
            }))
          };
        });
        setNfts(nftData);
      } catch (err) {
        console.error('Error fetching NFTs:', err);
        setError('Failed to load NFTs. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchNFTs();
  }, [account, packageId]);

  if (!account) return <p className="preview-description">Connect your wallet to view NFTs.</p>;
  if (loading) return <p className="preview-description">Loading NFTs...</p>;
  if (error) return <p className="preview-description" style={{ color: '#ef4444' }}>{error}</p>;

  return (
    <div className="nft-list">
      <h2 className="section-title">My NFTs</h2>
      {nfts.length === 0 ? (
        <p className="preview-description">No NFTs found.</p>
      ) : (
        <div className="nft-grid">
          {nfts.map(nft => (
            <div key={nft.id} className="card">
              <img
                src={nft.imageUrl}
                alt={nft.name}
                className="preview-image"
                onError={(e) => { e.target.src = 'https://via.placeholder.com/300?text=Invalid+Image'; }}
              />
              <h3 className="preview-title">{nft.name}</h3>
              <p className="preview-description">{nft.description}</p>
              <div className="attributes">
                <h4 className="preview-subtitle">Attributes</h4>
                <ul className="attribute-list">
                  {nft.attributes.map((attr, idx) => (
                    <li key={idx} className="attribute-item">
                      <strong>{attr.trait_type}:</strong> {attr.value}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                className="button button-primary"
                onClick={() => onTransfer(nft.id)}
              >
                Transfer NFT
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LoyaltyCardPage = () => {
  const currentAccount = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const [loading, setLoading] = useState(false);
  const [packageId, setPackageId] = useState('0x<your_package_id>'); // Replace with your package ID
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return localStorage.getItem('theme') === 'dark';
    } catch (e) {
      console.warn('localStorage not available:', e);
      return false;
    }
  });
  const [mintForm, setMintForm] = useState({
    customerId: '',
    imageUrl: '',
    name: '',
    description: '',
    attributes: [{ trait_type: '', value: '' }],
  });
  const [isDragging, setIsDragging] = useState(false);
  const [estimatedGasFee, setEstimatedGasFee] = useState(null);
  const [gasFeeError, setGasFeeError] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [activeTab, setActiveTab] = useState('mint');
  const [transferForm, setTransferForm] = useState({ nftId: '', recipient: '' });
  const [transactionHistory, setTransactionHistory] = useState([]);
  const fileInputRef = useRef(null);

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    try {
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    } catch (e) {
      console.warn('Failed to set localStorage:', e);
    }
  }, [isDarkMode]);

  useEffect(() => {
    console.log('Current Wallet:', currentWallet ? currentWallet.name : 'No wallet connected');
  }, [currentWallet]);

  useEffect(() => {
    const estimateGasFee = async () => {
      if (
        !packageId.trim() ||
        !mintForm.customerId.trim() ||
        !mintForm.imageUrl.trim() ||
        !mintForm.name.trim() ||
        !mintForm.description.trim() ||
        mintForm.attributes.some((attr) => !attr.trait_type.trim() || !attr.value.trim())
      ) {
        setEstimatedGasFee(null);
        setGasFeeError(null);
        return;
      }

      try {
        setGasFeeError(null);
        const tx = new Transaction();
        tx.moveCall({
          target: `${packageId}::loyalty_card::mint_loyalty`,
          arguments: [
            tx.pure.address(mintForm.customerId),
            tx.pure.string(mintForm.imageUrl),
            tx.pure.string(mintForm.name),
            tx.pure.string(mintForm.description),
            tx.pure(mintForm.attributes.map(attr => [attr.trait_type, attr.value]), 'vector<vector<string>>')
          ]
        });

        const dryRunResult = await suiClient.dryRunTransactionBlock({
          transactionBlock: await tx.build({ client: suiClient })
        });

        if (dryRunResult.effects.status.status === 'success') {
          const gasUsed = dryRunResult.effects.gasUsed;
          const totalGas = gasUsed.computationCost + gasUsed.storageCost - gasUsed.storageRebate;
          const gasInSui = totalGas / 1_000_000_000;
          setEstimatedGasFee(gasInSui.toFixed(6));
        } else {
          throw new Error('Dry run failed: ' + dryRunResult.effects.status.error);
        }
      } catch (error) {
        console.error('Gas estimation error:', error);
        setGasFeeError('Failed to estimate gas fee. Please check inputs.');
      }
    };

    estimateGasFee();
  }, [packageId, mintForm]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleMintChange = (e) => {
    const { name, value } = e.target;
    setMintForm({ ...mintForm, [name]: value });
    if (name === 'imageUrl' && value.trim()) {
      validateImageUrl(value);
    } else if (name === 'imageUrl' && !value.trim()) {
      setImageError(null);
    }
  };

  const handleAttributeChange = (index, field, value) => {
    const newAttributes = [...mintForm.attributes];
    newAttributes[index][field] = value;
    setMintForm({ ...mintForm, attributes: newAttributes });
  };

  const addAttribute = () => {
    setMintForm({
      ...mintForm,
      attributes: [...mintForm.attributes, { trait_type: '', value: '' }]
    });
  };

  const removeAttribute = (index) => {
    setMintForm({
      ...mintForm,
      attributes: mintForm.attributes.filter((_, i) => i !== index)
    });
  };

  const validateImageUrl = (url) => {
    const img = new Image();
    img.src = url;
    img.onload = () => setImageError(null);
    img.onerror = () => setImageError('Invalid image URL. Please use a valid PNG, JPEG, or GIF URL.');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && ['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
      processImageFile(file);
    } else {
      setImageError('Please drop a valid PNG, JPEG, or GIF image.');
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file && ['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
      processImageFile(file);
    } else {
      setImageError('Please select a valid PNG, JPEG, or GIF image.');
    }
  };

  const processImageFile = async (file) => {
    // Optional: Upload to Pinata IPFS (uncomment with API key)
    /*
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer <your_pinata_jwt>`
        },
        body: formData
      });
      const result = await response.json();
      if (result.IpfsHash) {
        const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
        setMintForm({ ...mintForm, imageUrl: ipfsUrl });
        setImageError(null);
      } else {
        throw new Error('IPFS upload failed');
      }
    } catch (err) {
      console.error('IPFS upload error:', err);
      setImageError('Failed to upload image to IPFS.');
    }
    */
    // Fallback: Base64 encoding
    const reader = new FileReader();
    reader.onload = (e) => {
      setMintForm({ ...mintForm, imageUrl: e.target.result });
      setImageError(null);
    };
    reader.onerror = () => {
      setImageError('Error reading image file. Please try another file.');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const mintLoyalty = async () => {
    if (!currentAccount) {
      alert('Please connect your wallet.');
      return;
    }
    if (!mintForm.imageUrl.trim() || imageError) {
      alert('Please provide a valid image URL or upload a valid image.');
      return;
    }
    try {
      setLoading(true);
      console.log('Minting NFT with wallet:', currentWallet?.value?.name);
      const tx = new Transaction();
      tx.setGasBudget(100000000);
      const isWellDone = currentWallet?.value?.name?.toLowerCase().includes('welldone');
      const attributes = mintForm.attributes.map(attr => [attr.trait_type, attr.value]);
      tx.moveCall({
        target: `${packageId}::loyalty_card::mint_loyalty`,
        arguments: isWellDone
          ? [
              tx.pure(mintForm.customerId, 'address'),
              tx.pure(new TextEncoder().encode(mintForm.imageUrl), 'vector<u8>'),
              tx.pure(new TextEncoder().encode(mintForm.name), 'vector<u8>'),
              tx.pure(new TextEncoder().encode(mintForm.description), 'vector<u8>'),
              tx.pure(
                attributes.map(attr => [
                  new TextEncoder().encode(attr[0]),
                  new TextEncoder().encode(attr[1])
                ]),
                'vector<vector<u8>>'
              )
            ]
          : [
              tx.pure(mintForm.customerId, 'address'),
              tx.pure(mintForm.imageUrl, 'string'),
              tx.pure(mintForm.name, 'string'),
              tx.pure(mintForm.description, 'string'),
              tx.pure(attributes, 'vector<vector<string>>')
            ]
      });
      await signAndExecute(
        {
          transaction: tx,
          options: { showEffects: true, showObjectChanges: true }
        },
        {
          onSuccess: (result) => {
            console.log('Mint NFT Result:', JSON.stringify(result, null, 2));
            setMintForm({
              customerId: '',
              imageUrl: '',
              name: '',
              description: '',
              attributes: [{ trait_type: '', value: '' }],
            });
            setEstimatedGasFee(null);
            setImageError(null);
            setTransactionHistory([
              ...transactionHistory,
              {
                type: 'Mint',
                txDigest: result.digest,
                timestamp: new Date().toISOString(),
                nftId: result.effects?.created?.[0]?.reference?.objectId || 'Unknown',
                name: mintForm.name
              }
            ]);
            alert('NFT minted successfully!');
          },
          onError: (error) => {
            throw error;
          }
        }
      );
    } catch (error) {
      console.error('Error minting loyalty card:', error.message, error.stack);
      alert(`Minting failed: ${error.message} (Wallet: ${currentWallet?.value?.name || 'Unknown'})`);
    } finally {
      setLoading(false);
    }
  };

  const transferNFT = async () => {
    if (!currentAccount) {
      alert('Please connect your wallet.');
      return;
    }
    if (!transferForm.nftId || !transferForm.recipient) {
      alert('Please provide NFT ID and recipient address.');
      return;
    }
    try {
      setLoading(true);
      const tx = new Transaction();
      tx.setGasBudget(100000000);
      tx.moveCall({
        target: `${packageId}::loyalty_card::transfer_loyalty`,
        arguments: [
          tx.object(transferForm.nftId),
          tx.pure(transferForm.recipient, 'address')
        ]
      });
      await signAndExecute(
        {
          transaction: tx,
          options: { showEffects: true, showObjectChanges: true }
        },
        {
          onSuccess: (result) => {
            console.log('Transfer NFT Result:', JSON.stringify(result, null, 2));
            setTransferForm({ nftId: '', recipient: '' });
            setTransactionHistory([
              ...transactionHistory,
              {
                type: 'Transfer',
                txDigest: result.digest,
                timestamp: new Date().toISOString(),
                nftId: transferForm.nftId,
                recipient: transferForm.recipient
              }
            ]);
            alert('NFT transferred successfully!');
          },
          onError: (error) => {
            throw error;
          }
        }
      );
    } catch (error) {
      console.error('Error transferring NFT:', error.message, error.stack);
      alert(`Transfer failed: ${error.message} (Wallet: ${currentWallet?.value?.name || 'Unknown'})`);
    } finally {
      setLoading(false);
    }
  };

  const exportHistory = () => {
    if (transactionHistory.length === 0) {
      alert('No transaction history to export.');
      return;
    }
    const csv = [
      'Type,Transaction Digest,Timestamp,NFT ID,Name,Recipient',
      ...transactionHistory.map(tx =>
        `${tx.type},${tx.txDigest},${tx.timestamp},${tx.nftId},${tx.name || ''},${tx.recipient || ''}`
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'nft_transaction_history.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTransferClick = (nftId) => {
    setTransferForm({ ...transferForm, nftId });
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="page-title">Mint Your NFT on SUI</h1>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </header>
      <div className="connect-wallet">
        <ConnectButton />
      </div>
      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'mint' ? 'active' : ''}`}
          onClick={() => setActiveTab('mint')}
        >
          Mint NFT
        </button>
        <button
          className={`tab-button ${activeTab === 'my-nfts' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-nfts')}
        >
          My NFTs
        </button>
      </div>
      <div className="main-content">
        {activeTab === 'mint' && (
          <>
            <div className="package-input">
              <label className="input-label">Package ID</label>
              <input
                type="text"
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                placeholder="Enter Package ID"
                className="input-field"
              />
            </div>
            <section className="form-section">
              <h2 className="section-title">Mint Loyalty Card</h2>
              <label className="input-label">Wallet Address</label>
              <input
                type="text"
                name="customerId"
                value={mintForm.customerId}
                onChange={handleMintChange}
                placeholder="Enter Customer Sui Address"
                className="input-field"
              />
              <label className="input-label">Image URL or Upload</label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`drag-drop-area ${isDragging ? 'drag-active' : ''}`}
                onClick={() => fileInputRef.current.click()}
              >
                <p>{isDragging ? 'Drop the image here' : 'Drag & drop a PNG, JPEG, or GIF image, or click to select'}</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInput}
                  accept="image/png,image/jpeg,image/gif"
                  style={{ display: 'none' }}
                />
              </div>
              {imageError && (
                <p className="preview-description" style={{ color: '#ef4444', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  {imageError}
                </p>
              )}
              <input
                type="text"
                name="imageUrl"
                value={mintForm.imageUrl}
                onChange={handleMintChange}
                placeholder="Or enter image URL (PNG, JPEG, GIF)"
                className="input-field"
              />
              <label className="input-label">Name</label>
              <input
                type="text"
                name="name"
                value={mintForm.name}
                onChange={handleMintChange}
                placeholder="Enter NFT Name"
                className="input-field"
              />
              <label className="input-label">Description</label>
              <textarea
                name="description"
                value={mintForm.description}
                onChange={handleMintChange}
                placeholder="Enter NFT Description"
                rows="4"
                className="input-field textarea"
              />
              <label className="input-label">Attributes</label>
              {mintForm.attributes.map((attr, index) => (
                <div key={index} className="attribute-row">
                  <input
                    type="text"
                    value={attr.trait_type}
                    onChange={(e) => handleAttributeChange(index, 'trait_type', e.target.value)}
                    placeholder="Trait Type (e.g., Background)"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={attr.value}
                    onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
                    placeholder="Value (e.g., Blue)"
                    className="input-field"
                  />
                  <button
                    onClick={() => removeAttribute(index)}
                    disabled={mintForm.attributes.length === 1}
                    className="button button-danger"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={addAttribute}
                className="button button-secondary"
              >
                Add Attribute
              </button>
              <button
                onClick={mintLoyalty}
                disabled={
                  loading ||
                  !mintForm.customerId.trim() ||
                  !mintForm.imageUrl.trim() ||
                  !mintForm.name.trim() ||
                  !mintForm.description.trim() ||
                  mintForm.attributes.some(
                    (attr) => !attr.trait_type.trim() || !attr.value.trim()
                  ) ||
                  imageError
                }
                className="button button-primary"
              >
                Mint Your NFT
              </button>
              <p className="gas-fee-display">
                {gasFeeError ? (
                  <span style={{ color: '#ef4444' }}>{gasFeeError}</span>
                ) : estimatedGasFee ? (
                  `Est. Gas Fee: ~${estimatedGasFee} SUI`
                ) : (
                  'Enter all fields to estimate gas fee'
                )}
              </p>
            </section>
            <NFTPreview
              imageUrl={mintForm.imageUrl}
              name={mintForm.name}
              description={mintForm.description}
              attributes={mintForm.attributes.filter(
                (attr) => attr.trait_type.trim() && attr.value.trim()
              )}
            />
          </>
        )}
        {activeTab === 'my-nfts' && (
          <section className="form-section">
            <MyNFTs
              account={currentAccount}
              packageId={packageId}
              onTransfer={handleTransferClick}
            />
            {transferForm.nftId && (
              <div className="transfer-form">
                <h2 className="section-title">Transfer NFT</h2>
                <label className="input-label">NFT ID</label>
                <input
                  type="text"
                  value={transferForm.nftId}
                  readOnly
                  className="input-field"
                />
                <label className="input-label">Recipient Address</label>
                <input
                  type="text"
                  value={transferForm.recipient}
                  onChange={(e) => setTransferForm({ ...transferForm, recipient: e.target.value })}
                  placeholder="Enter Recipient Sui Address"
                  className="input-field"
                />
                <button
                  onClick={transferNFT}
                  disabled={loading || !transferForm.recipient.trim()}
                  className="button button-primary"
                >
                  Transfer
                </button>
                <button
                  onClick={() => setTransferForm({ nftId: '', recipient: '' })}
                  className="button button-secondary"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="history-section">
              <h2 className="section-title">Transaction History</h2>
              <button
                onClick={exportHistory}
                className="button button-secondary"
              >
                Export History as CSV
              </button>
              {transactionHistory.length === 0 ? (
                <p className="preview-description">No transactions yet.</p>
              ) : (
                <ul className="history-list">
                  {transactionHistory.map((tx, idx) => (
                    <li key={idx} className="history-item">
                      <strong>{tx.type}</strong>: {tx.nftId} at {tx.timestamp}
                      {tx.recipient && <span> to {tx.recipient}</span>}
                      <a
                        href={`https://suiscan.xyz/devnet/tx/${tx.txDigest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="history-link"
                      >
                        View on Sui Explorer
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default LoyaltyCardPage;
