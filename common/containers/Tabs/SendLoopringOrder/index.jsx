// @flow

import React from 'react';
import translate from 'translations';
import { UnlockHeader } from 'components/ui';
import {
  AddressField,
  AllowanceAmountField,
  BuyAmountField,
  SellAmountField,
  CustomMessage,
  DataField,
  GasField,
  ConfirmationModal
} from './components';
import { BalanceSidebar } from 'components';
import pickBy from 'lodash/pickBy';
import type { State as AppState } from 'reducers';
import { connect } from 'react-redux';
import BaseWallet from 'libs/wallet/base';
import customMessages from './messages';
import type { NetworkConfig, Token, NodeConfig } from 'config/data';
import { donationAddressMap } from 'config/data';
import { isValidETHAddress } from 'libs/validators';
import {
  getGasPriceGwei,
  getNetworkConfig,
  getNodeLib,
  getNodeConfig
} from 'selectors/config';
import type { TokenBalance } from 'selectors/wallet';
import { getTokenBalances, getTokens } from 'selectors/wallet';
import Big from 'bignumber.js';
import { valueToHex } from 'libs/values';
import ERC20 from 'libs/erc20';
import type { RPCNode } from 'libs/nodes';
import type {
  BroadcastTransaction,
  TransactionWithoutGas
} from 'libs/transaction';
import type { UNIT } from 'libs/units';
import { toWei } from 'libs/units';
import { formatGasLimit } from 'utils/formatters';
import type { ShowNotificationAction } from 'actions/notifications';
import { showNotification } from 'actions/notifications';
import { sha3, setLengthLeft, toBuffer } from 'ethereumjs-util';

type State = {
  hasQueryString: boolean,
  readOnly: boolean,
  to: string,
  buyAmount: string,
  sellAmount: string,
  allowAmount: string,
  buyUnit: UNIT,
  sellUnit: UNIT,
  allowUnit: UNIT,
  gasLimit: string,
  data: string,
  gasChanged: boolean,
  showTxConfirm: boolean,
  showAllow: boolean,
  transaction: ?BroadcastTransaction
};

function getParam(query: { [string]: string }, key: string) {
  const keys = Object.keys(query);
  const index = keys.findIndex(k => k.toLowerCase() === key.toLowerCase());
  if (index === -1) {
    return null;
  }

  return query[keys[index]];
}

type Props = {
  location: {
    query: {
      [string]: string
    }
  },
  wallet: BaseWallet,
  balance: Big,
  nodeLib: RPCNode,
  node: NodeConfig,
  network: NetworkConfig,
  tokens: Token[],
  tokenBalances: TokenBalance[],
  gasPrice: number,
  showNotification: (
    level: string,
    msg: string,
    duration?: number
  ) => ShowNotificationAction
};

export class SendExchange extends React.Component {
  props: Props;
  state: State = {
    hasQueryString: false,
    readOnly: false,
    buyAmount: '',
    sellAmount: '',
    allowAmount: '',
    buyUnit: 'ether',
    sellUnit: 'ether',
    allowUnit: 'ether',
    gasLimit: '21000',
    data: '',
    gasChanged: false,
    showTxConfirm: false,
    showAllow: false,
    transaction: null
  };

  componentDidMount() {
    const queryPresets = pickBy(this.parseQuery());
    if (Object.keys(queryPresets).length) {
      this.setState({ ...queryPresets, hasQueryString: true });
    }
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (
      !this.state.gasChanged &&
      this.isValid() &&
      (this.state.to !== prevState.to ||
        this.state.value !== prevState.value ||
        this.state.unit !== prevState.unit ||
        this.state.data !== prevState.data)
    ) {
      this.estimateGas();
    }
  }

  render() {
    const unlocked = !!this.props.wallet;
    const {
      to,
      buyAmount,
      sellAmount,
      allowAmount,
      buyUnit,
      sellUnit,
      allowUnit,
      gasLimit,
      data,
      readOnly,
      hasQueryString,
      showTxConfirm,
      showAllow,
      transaction
    } = this.state;
    const customMessage = customMessages.find(m => m.to === to);

    return (
      <section className="container" style={{ minHeight: '50%' }}>
        <div className="tab-content">
          <main className="tab-pane active">
            {hasQueryString &&
              <div className="alert alert-info">
                <p>
                  {translate('WARN_Send_Link')}
                </p>
              </div>}

            <UnlockHeader title={'NAV_SendLoopringOrder'} />

            {unlocked &&
              <article className="row">
                {'' /* <!-- Sidebar --> */}
                <section className="col-sm-4">
                  <div style={{ maxWidth: 350 }}>
                    <BalanceSidebar />
                    <hr />
                  </div>
                </section>

                <section className="col-sm-8">
                  <div className="row form-group">
                    <h4 className="col-xs-12">
                      {translate('SEND_trans')}
                    </h4>
                  </div>
                  <SellAmountField
                    value={sellAmount}
                    unit={sellUnit}
                    tokens={this.props.tokenBalances
                      // .filter(token => !token.balance.eq(0))
                      .map(token => token.symbol)
                      .sort()}
                    toAllow={this.toAllow}
                    onChange={readOnly ? void 0 : this.onSellAmountChange}
                  />
                  <BuyAmountField
                    value={buyAmount}
                    unit={buyUnit}
                    tokens={this.props.tokenBalances
                      // .filter(token => !token.balance.eq(0))
                      .map(token => token.symbol)
                      .sort()}
                    onChange={readOnly ? void 0 : this.onBuyAmountChange}
                  />
                  <div className="form-group">
                    <a
                      className="btn btn-primary btn-block col-sm-11"
                      onClick={this.submitTx}
                    >
                      {translate('Submit_tx')}
                    </a>
                  </div>
                </section>
                {showAllow &&
                  <section className="col-sm-8">
                    <div className="row form-group">
                      <h4 className="col-xs-12">
                        {translate('Approve_Allowance')}
                      </h4>
                    </div>
                    <AddressField value={donationAddressMap.ETH} />
                    <AllowanceAmountField
                      title="Allow_amount"
                      value={allowAmount}
                      unit={allowUnit}
                      tokens={this.props.tokenBalances
                        // .filter(token => !token.balance.eq(0))
                        .map(token => token.symbol)
                        .sort()}
                      onChange={
                        readOnly ? void 0 : this.onAllowanceAmountChange
                      }
                    />
                    <GasField
                      value={gasLimit}
                      onChange={readOnly ? void 0 : this.onGasChange}
                    />
                    <DataField value={data} />
                    <CustomMessage message={customMessage} />

                    <div className="row form-group">
                      <div className="col-xs-12 clearfix">
                        <a
                          className="btn btn-info btn-block"
                          onClick={this.generateTx}
                        >
                          {translate('SEND_generate')}
                        </a>
                      </div>
                    </div>

                    <div className="row form-group">
                      <div className="col-sm-6">
                        <label>
                          {translate('SEND_raw')}
                        </label>
                        <textarea
                          className="form-control"
                          value={transaction ? transaction.rawTx : ''}
                          rows="4"
                          readOnly
                        />
                      </div>
                      <div className="col-sm-6">
                        <label>
                          {translate('SEND_signed')}
                        </label>
                        <textarea
                          className="form-control"
                          value={transaction ? transaction.signedTx : ''}
                          rows="4"
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <a
                        className="btn btn-primary btn-block col-sm-11"
                        onClick={this.openTxModal}
                      >
                        {translate('SEND_trans')}
                      </a>
                    </div>
                  </section>}
              </article>}
          </main>
        </div>
        {transaction &&
          showTxConfirm &&
          <ConfirmationModal
            wallet={this.props.wallet}
            node={this.props.node}
            signedTransaction={transaction.signedTx}
            allowanceValue={this.state.value}
            onCancel={this.cancelTx}
            onConfirm={this.confirmTx}
          />}
      </section>
    );
  }

  parseQuery() {
    const query = this.props.location.query;
    const to = getParam(query, 'to');
    const data = getParam(query, 'data');
    const unit = getParam(query, 'tokenSymbol');
    const value = getParam(query, 'value');
    let gasLimit = getParam(query, 'gas');
    if (gasLimit === null) {
      gasLimit = getParam(query, 'limit');
    }
    const readOnly = getParam(query, 'readOnly') == null ? false : true;

    return { to, data, value, unit, gasLimit, readOnly };
  }

  isValid() {
    const { to, value } = this.state;
    return (
      isValidETHAddress(to) &&
      value &&
      Number(value) > 0 &&
      !isNaN(Number(value)) &&
      isFinite(Number(value))
    );
  }

  async getTransactionFromState(): Promise<TransactionWithoutGas> {
    const { wallet } = this.props;

    if (this.state.unit === 'ether') {
      return {
        to: this.state.to,
        from: await wallet.getAddress(),
        value: valueToHex(this.state.value)
      };
    }
    const token = this.props.tokens.find(x => x.symbol === this.state.unit);
    if (!token) {
      throw new Error('No matching token');
    }

    return {
      to: token.address,
      from: await wallet.getAddress(),
      value: '0x0',
      data: ERC20.transfer(
        this.state.to,
        new Big(this.state.value).times(new Big(10).pow(token.decimal))
      )
    };
  }

  async estimateGas() {
    const trans = await this.getTransactionFromState();
    if (!trans) {
      return;
    }

    // Grab a reference to state. If it has changed by the time the estimateGas
    // call comes back, we don't want to replace the gasLimit in state.
    const state = this.state;

    this.props.nodeLib.estimateGas(trans).then(gasLimit => {
      if (this.state === state) {
        this.setState({ gasLimit: formatGasLimit(gasLimit, state.unit) });
      }
    });
  }

  // FIXME use mkTx instead or something that could take care of default gas/data and whatnot,
  onNewTx = (
    address: string,
    amount: string,
    unit: string,
    data: string = '',
    gasLimit: string = '21000'
  ) => {
    this.setState({
      to: address,
      value: amount,
      unit,
      data,
      gasLimit,
      gasChanged: false
    });
  };

  onGasChange = (value: string) => {
    this.setState({ gasLimit: value, gasChanged: true });
  };

  onAllowanceAmountChange = (value: string, unit: string) => {
    if (value === 'everything') {
      if (unit === 'ether') {
        value = this.props.balance.toString();
      }
      const token = this.props.tokenBalances.find(
        token => token.symbol === unit
      );
      if (!token) {
        return;
      }
      value = token.balance.toString();
    }

    const method =
      '0x' + sha3('approve(address, uint256)').toString('hex').slice(0, 8);

    const address = setLengthLeft(
      toBuffer(donationAddressMap.ETH),
      32
    ).toString('hex');

    let data =
      method +
      address +
      setLengthLeft(toBuffer('0x' + parseInt(value).toString(16)), 32).toString(
        'hex'
      );

    if (!value || value === '') {
      data =
        method +
        address +
        setLengthLeft(toBuffer('0x' + parseInt('0').toString(16)), 32).toString(
          'hex'
        );
    }

    let toAddress = '';

    const token = this.props.tokens.find(token => token.symbol === unit);

    if (token) {
      toAddress = token.address;
    }

    this.setState({
      to: toAddress,
      allowAmount: value,
      allowUnit: unit,
      data: data
    });
  };

  onBuyAmountChange = (value: string, unit: string) => {
    this.setState({
      buyAmount: value,
      buyUnit: unit
    });
  };

  onSellAmountChange = (value: string, unit: string) => {
    this.setState({
      sellAmount: value,
      sellUnit: unit
    });
  };

  generateTx = async () => {
    const { nodeLib, wallet } = this.props;
    const address = await wallet.getAddress();

    try {
      const transaction = await nodeLib.generateTransaction(
        {
          to: this.state.to,
          from: address,
          value: '0',
          gasLimit: this.state.gasLimit,
          gasPrice: this.props.gasPrice,
          data: this.state.data,
          chainId: this.props.network.chainId
        },
        wallet
      );

      this.setState({ transaction });
    } catch (err) {
      this.props.showNotification('danger', err.message, 5000);
    }
  };

  toAllow = () => {
    this.setState({
      showAllow: true
    });
  };

  openTxModal = () => {
    if (this.state.transaction) {
      this.setState({ showTxConfirm: true });
    }
  };

  cancelTx = () => {
    this.setState({ showTxConfirm: false });
  };

  confirmTx = (rawtx: string, tx: EthTx) => {
    console.log(rawtx);
    console.log(tx);
  };

  submitTx = () => {};
}

function mapStateToProps(state: AppState) {
  return {
    wallet: state.wallet.inst,
    balance: state.wallet.balance,
    tokenBalances: getTokenBalances(state),
    node: getNodeConfig(state),
    nodeLib: getNodeLib(state),
    network: getNetworkConfig(state),
    tokens: getTokens(state),
    gasPrice: toWei(new Big(getGasPriceGwei(state)), 'gwei')
  };
}

export default connect(mapStateToProps, { showNotification })(SendExchange);
