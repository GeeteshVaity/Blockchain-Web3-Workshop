import React, { useState, useRef, useEffect } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import {
  useSignAndExecuteTransaction,
  ConnectButton,
  useCurrentAccount
} from '@mysten/dapp-kit';
import './app.css';

// Initialize SuiClient for RPC calls
const suiClient = new SuiClient({ url: getFullnodeUrl('devnet') });

const NFTPreview = ({ imageUrl, name, description, attributes, collectionName, collectionDescription }) => {
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
        {collectionName && (
          <div className="collection-info">
            <h4 className="preview-subtitle">Collection</h4>
            <p className="collection-name">{collectionName}</p>
            <p className="collection-description">{collectionDescription || 'No collection description'}</p>
          </div>
        )}
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

const LoyaltyCardPage = () => {
  const currentAccount = useCurrentAccount();
  const [loading, setLoading] = useState(false);
  const [packageId, setPackageId] = useState('');
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
    collectionId: '',
    collectionName: '',
    collectionDescription: ''
  });
  const [isDragging, setIsDragging] = useState(false);
  const [estimatedGasFee, setEstimatedGasFee] = useState(null);
  const [gasFeeError, setGasFeeError] = useState(null);
  const [imageError, setImageError] = useState(null);
  const fileInputRef = useRef(null);

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  useEffect(() => {
    console.log('UseEffect triggered, isDarkMode:', isDarkMode);
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

  // Estimate gas fee when mintForm or packageId changes
  useEffect(() => {
    const estimateGasFee = async () => {
      if (
        !packageId.trim() ||
        !mintForm.customerId.trim() ||
        !mintForm.imageUrl.trim() ||
        !mintForm.name.trim() ||
        !mintForm.description.trim() ||
        !mintForm.collectionId.trim() ||
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
            tx.pure(mintForm.customerId),
            tx.pure(mintForm.imageUrl),
            tx.pure(mintForm.name),
            tx.pure(mintForm.description),
            tx.pure(mintForm.attributes.map(attr => ({
              trait_type: attr.trait_type,
              value: attr.value
            }))),
            tx.pure(mintForm.collectionId)
          ]
        });

        const dryRunResult = await suiClient.dryRunTransactionBlock({
          transactionBlock: await tx.build({ client: suiClient })
        });

        if (dryRunResult.effects.status.status === 'success') {
          const gasUsed = dryRunResult.effects.gasUsed;
          const totalGas = gasUsed.computationCost + gasUsed.storageCost - gasUsed.storageRebate;
          const gasInSui = totalGas / 1_000_000_000; // Convert MIST to SUI
          setEstimatedGasFee(gasInSui.toFixed(6)); // Display up to 6 decimal places
        } else {
          throw new Error('Dry run failed: ' + dryRunResult.effects.status.error);
        }
      } catch (error) {
        console.error('Gas estimation error:', error);
        setEstimatedGasFee(null);
        setGasFeeError('Failed to estimate gas fee. Please check inputs.');
      }
    };

    estimateGasFee();
  }, [packageId, mintForm]);

  const toggleTheme = () => {
    console.log('ToggleTheme called, current isDarkMode:', isDarkMode);
    setIsDarkMode(!isDarkMode);
  };

  const handleMintChange = (e) => {
    const { name, value } = e.target;
    setMintForm({ ...mintForm, [name]: value });

    // Validate image URL if changed
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

  const processImageFile = (file) => {
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

  const createCollection = async () => {
    if (!currentAccount) {
      alert('Please connect your wallet');
      return;
    }
    if (!mintForm.collectionName.trim()) {
      alert('Collection name is required');
      return;
    }
    try {
      setLoading(true);
      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::loyalty_card::create_collection`,
        arguments: [
          tx.pure(mintForm.collectionName),
          tx.pure(mintForm.collectionDescription)
        ]
      });
      const result = await signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            const collectionId = result.effects.created[0].reference.objectId;
            setMintForm({ ...mintForm, collectionId });
            alert('Collection created successfully!');
          },
          onError: (error) => {
            throw error;
          }
        }
      );
    } catch (error) {
      console.error('Error creating collection:', error);
      alert(`Collection creation failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const mintLoyalty = async () => {
    if (!currentAccount) {
      alert('Please connect your wallet');
      return;
    }
    if (!mintForm.collectionId.trim()) {
      alert('Please create or select a collection');
      return;
    }
    if (!mintForm.imageUrl.trim() || imageError) {
      alert('Please provide a valid image URL or upload a valid image.');
      return;
    }
    try {
      setLoading(true);
      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::loyalty_card::mint_loyalty`,
        arguments: [
          tx.pure(mintForm.customerId),
          tx.pure(mintForm.imageUrl),
          tx.pure(mintForm.name),
          tx.pure(mintForm.description),
          tx.pure(mintForm.attributes.map(attr => ({
            trait_type: attr.trait_type,
            value: attr.value
          }))),
          tx.pure(mintForm.collectionId)
        ]
      });
      await signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            setMintForm({
              customerId: '',
              imageUrl: '',
              name: '',
              description: '',
              attributes: [{ trait_type: '', value: '' }],
              collectionId: '',
              collectionName: '',
              collectionDescription: ''
            });
            setEstimatedGasFee(null);
            setImageError(null);
            alert('NFT minted successfully!');
          },
          onError: (error) => {
            throw error;
          }
        }
      );
    } catch (error) {
      console.error('Error minting loyalty card:', error);
      alert(`Minting failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
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
      <div className="main-content">
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
          <h2 className="section-title">Create Collection</h2>
          <label className="input-label">Collection Name</label>
          <input
            type="text"
            name="collectionName"
            value={mintForm.collectionName}
            onChange={handleMintChange}
            placeholder="Enter Collection Name"
            className="input-field"
          />
          <label className="input-label">Collection Description</label>
          <textarea
            name="collectionDescription"
            value={mintForm.collectionDescription}
            onChange={handleMintChange}
            placeholder="Enter Collection Description"
            rows="4"
            className="input-field textarea"
          />
          <button
            onClick={createCollection}
            disabled={loading || !mintForm.collectionName.trim()}
            className="button button-primary"
          >
            Create Collection
          </button>
          <h2 className="section-title">Mint Loyalty Card</h2>
          <label className="input-label">Collection ID</label>
          <input
            type="text"
            name="collectionId"
            value={mintForm.collectionId}
            onChange={handleMintChange}
            placeholder="Enter Collection ID (auto-filled after creation)"
            className="input-field"
          />
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
              !mintForm.collectionId.trim() ||
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
      </div>
      <NFTPreview
        imageUrl={mintForm.imageUrl}
        name={mintForm.name}
        description={mintForm.description}
        attributes={mintForm.attributes.filter(
          (attr) => attr.trait_type.trim() && attr.value.trim()
        )}
        collectionName={mintForm.collectionName}
        collectionDescription={mintForm.collectionDescription}
      />
    </div>
  );
};

export default LoyaltyCardPage;