// @flow
import './ConfirmationModal.scss';
import React from 'react';
import translate from 'translations';
import Big from 'bignumber.js';
import EthTx from 'ethereumjs-tx';
import { connect } from 'react-redux';
import BaseWallet from 'libs/wallet/base';
import { toUnit, toTokenDisplay } from 'libs/units';
import ERC20 from 'libs/erc20';
import { getTransactionFields } from 'libs/transaction';
import { getTokens } from 'selectors/wallet';
import { getNetworkConfig } from 'selectors/config';
import type { NodeConfig } from 'config/data';
import type { Token, NetworkConfig } from 'config/data';
import Modal from 'components/ui/Modal';
import Identicon from 'components/ui/Identicon';

type Props = {
  signedTransaction: string,
  transaction: EthTx,
  wallet: BaseWallet,
  node: NodeConfig,
  token: ?Token,
  network: NetworkConfig,
  onConfirm: (string, EthTx) => void,
  onCancel: () => void
};

type State = {
  fromAddress: string,
  timeToRead: number
};

class ConfirmationModal extends React.Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);

    this.state = {
      fromAddress: '',
      timeToRead: 5
    };
  }

  componentWillReceiveProps(newProps: Props) {
    // Reload address if the wallet changes
    if (newProps.wallet !== this.props.wallet) {
      this._setWalletAddress(this.props.wallet);
    }
  }

  // Count down 5 seconds before allowing them to confirm
  readTimer = 0;

  componentDidMount() {
    this.readTimer = setInterval(() => {
      if (this.state.timeToRead > 0) {
        this.setState({ timeToRead: this.state.timeToRead - 1 });
      } else {
        clearInterval(this.readTimer);
      }
    }, 1000);

    this._setWalletAddress(this.props.wallet);
  }

  componentWillUnmount() {
    clearInterval(this.readTimer);
  }

  _setWalletAddress(wallet: BaseWallet) {
    wallet.getAddress().then(fromAddress => {
      this.setState({ fromAddress });
    });
  }

  _decodeTransaction() {
    const { transaction, token } = this.props;
    const { to, value, data, gasPrice } = getTransactionFields(transaction);

    const fixedValue = toUnit(new Big(value, 16), 'wei', 'ether').toString();
    return {
      value: fixedValue,
      gasPrice: toUnit(new Big(gasPrice, 16), 'wei', 'gwei').toString(),
      data,
      toAddress: to
    };
  }

  _confirm = () => {
    const { signedTransaction, transaction } = this.props;
    this.props.onConfirm(signedTransaction, transaction);
  };

  render() {
    const { node, token, network, onCancel } = this.props;
    const { fromAddress, timeToRead } = this.state;
    const { toAddress, value, gasPrice, data } = this._decodeTransaction();

    const buttonPrefix = timeToRead > 0 ? `(${timeToRead}) ` : '';
    const buttons = [
      {
        text: buttonPrefix + translate('SENDModal_Yes'),
        type: 'primary',
        disabled: timeToRead > 0,
        onClick: this._confirm
      },
      {
        text: translate('SENDModal_No'),
        type: 'default',
        onClick: onCancel
      }
    ];

    const symbol = token ? token.symbol : network.unit;

    return (
      <Modal
        title="Confirm Your Transaction"
        buttons={buttons}
        handleClose={onCancel}
        isOpen={true}
      >
        <div className="ConfModal">
          <div className="ConfModal-summary">
            <div className="ConfModal-summary-icon ConfModal-summary-icon--from">
              <Identicon size="100%" address={fromAddress} />
            </div>
            <div className="ConfModal-summary-amount">
              <div className="ConfModal-summary-amount-arrow" />
              <div className="ConfModal-summary-amount-currency">
                {value} {symbol}
              </div>
            </div>
            <div className="ConfModal-summary-icon ConfModal-summary-icon--to">
              <Identicon size="100%" address={toAddress} />
            </div>
          </div>

          <ul className="ConfModal-details">
            <li className="ConfModal-details-detail">
              You are sending from <code>{fromAddress}</code>
            </li>
            <li className="ConfModal-details-detail">
              You are sending to <code>{toAddress} </code>
            </li>
            <li className="ConfModal-details-detail">
              You are sending{' '}
              <strong>
                {value} {symbol}
              </strong>{' '}
              with a gas price of <strong>{gasPrice} gwei</strong>
            </li>
            <li className="ConfModal-details-detail">
              You are interacting with the <strong>{node.network}</strong>{' '}
              network provided by <strong>{node.service}</strong>
            </li>
            {!token &&
              <li className="ConfModal-details-detail">
                {data
                  ? <span>
                      You are sending the following data:{' '}
                      <textarea
                        className="form-control"
                        value={data}
                        rows="3"
                        disabled
                      />
                    </span>
                  : 'There is no data attached to this transaction'}
              </li>}
          </ul>

          <div className="ConfModal-confirm">
            {translate('SENDModal_Content_3')}
          </div>
        </div>
      </Modal>
    );
  }
}

function mapStateToProps(state, props) {
  // Convert the signedTransaction to an EthTx transaction
  const transaction = new EthTx(props.signedTransaction);

  // Network config for defaults
  const network = getNetworkConfig(state);

  // Determine if we're sending to a token from the transaction to address
  const { to, data } = getTransactionFields(transaction);
  const tokens = getTokens(state);
  const token = data && tokens.find(t => t.address === to);

  return {
    transaction,
    token,
    network
  };
}

export default connect(mapStateToProps)(ConfirmationModal);
