// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IPaymentToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Invoices funded in one fixed ERC-20. Quantities use thousandths of the agreed unit.
contract DeliveryEscrow {
    enum Status { None, Funded, InReview, Partial, Held, Settled, Refunded }
    struct Order {
        address buyer;
        address supplier;
        uint128 amount;
        uint128 paid;
        uint64 requiredQty;
        uint64 reportedQty;
        uint64 acceptedQty;
        uint64 deadline;
        bytes32 termsHash;
        bytes32 evidenceHash;
        bool proportional;
        Status status;
    }

    IPaymentToken public token;
    mapping(bytes32 => Order) private ledger;
    mapping(bytes32 => uint64[]) private payoutBlocks;

    event Funded(bytes32 indexed id, address indexed buyer, address indexed supplier, uint256 amount, bytes32 termsHash);
    event EvidenceSubmitted(bytes32 indexed id, bytes32 evidenceHash, uint64 reportedQty);
    event Reviewed(bytes32 indexed id, bytes32 indexed evidenceHash, uint64 acceptedQty, uint256 releasedNow, uint256 totalPaid, uint256 retained);
    event Refunded(bytes32 indexed id, address indexed buyer, uint256 amount);

    error InvalidTerms();
    error DuplicateOrder();
    error WrongRole();
    error WrongState();
    error Deadline();
    error EvidenceChanged();
    error InvalidQuantity();
    error TransferFailed();

    constructor(address fixedToken) {
        if (fixedToken.code.length == 0) revert InvalidTerms();
        token = IPaymentToken(fixedToken);
    }

    function orders(bytes32 id) external view returns (Order memory) { return ledger[id]; }
    function payoutCount(bytes32 id) external view returns (uint256) { return payoutBlocks[id].length; }
    function payoutBlock(bytes32 id, uint256 index) external view returns (uint64) { return payoutBlocks[id][index]; }

    function orderId(address buyer, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(buyer, salt));
    }

    function fund(bytes32 salt, address supplier, uint128 amount, uint64 requiredQty, bool proportional, bytes32 termsHash, uint64 deadline) external returns (bytes32 id) {
        if (supplier == address(0) || supplier == msg.sender || supplier == address(this) || amount == 0 || requiredQty == 0 || termsHash == 0 || salt == 0) revert InvalidTerms();
        if (deadline <= block.timestamp) revert Deadline();
        id = orderId(msg.sender, salt);
        if (ledger[id].status != Status.None) revert DuplicateOrder();
        ledger[id] = Order(msg.sender, supplier, amount, 0, requiredQty, 0, 0, deadline, termsHash, 0, proportional, Status.Funded);
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Funded(id, msg.sender, supplier, amount, termsHash);
    }

    function submitEvidence(bytes32 id, bytes32 evidenceHash, uint64 reportedQty) external {
        Order storage o = ledger[id];
        if (msg.sender != o.supplier) revert WrongRole();
        if (o.status == Status.Settled || o.status == Status.Refunded) revert WrongState();
        if (block.timestamp >= o.deadline) revert Deadline();
        if (evidenceHash == 0) revert InvalidTerms();
        if (reportedQty < o.acceptedQty || reportedQty == 0 || reportedQty > o.requiredQty) revert InvalidQuantity();
        o.evidenceHash = evidenceHash;
        o.reportedQty = reportedQty;
        o.status = Status.InReview;
        emit EvidenceSubmitted(id, evidenceHash, reportedQty);
    }

    /// @dev Cumulative entitlements avoid losing rounding remainders over several instalments.
    function review(bytes32 id, bytes32 reviewedHash, uint64 acceptedToDate) external {
        Order storage o = ledger[id];
        if (msg.sender != o.buyer) revert WrongRole();
        if (o.status != Status.InReview) revert WrongState();
        if (block.timestamp >= o.deadline) revert Deadline();
        if (o.evidenceHash != reviewedHash) revert EvidenceChanged();
        if (acceptedToDate < o.acceptedQty || acceptedToDate > o.reportedQty) revert InvalidQuantity();

        uint128 entitlement = acceptedToDate == o.requiredQty ? o.amount
            : o.proportional ? uint128(uint256(o.amount) * acceptedToDate / o.requiredQty) : 0;
        uint128 delta = entitlement - o.paid;
        o.acceptedQty = acceptedToDate;
        o.paid = entitlement;
        o.status = acceptedToDate == o.requiredQty ? Status.Settled : delta > 0 ? Status.Partial : Status.Held;
        if (delta > 0) {
            if (payoutBlocks[id].length == 0 || payoutBlocks[id][payoutBlocks[id].length - 1] != block.number) {
                payoutBlocks[id].push(uint64(block.number));
            }
            if (!token.transfer(o.supplier, delta)) revert TransferFailed();
        }
        emit Reviewed(id, reviewedHash, acceptedToDate, delta, entitlement, o.amount - entitlement);
    }

    /// @notice After expiry any caller may return only the unspent balance to its original buyer.
    function refundExpired(bytes32 id) external {
        Order storage o = ledger[id];
        if (o.status == Status.None || o.status == Status.Settled || o.status == Status.Refunded) revert WrongState();
        if (block.timestamp < o.deadline) revert Deadline();
        o.status = Status.Refunded;
        uint128 remaining = o.amount - o.paid;
        if (!token.transfer(o.buyer, remaining)) revert TransferFailed();
        emit Refunded(id, o.buyer, remaining);
    }
}
