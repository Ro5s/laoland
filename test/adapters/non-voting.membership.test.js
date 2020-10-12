const {
  advanceTime,
  createDao,
  GUILD,
  sharePrice,
  remaining,
  OLTokenContract,
  NonVotingOnboardingContract,
  VotingContract,
} = require("../../utils/DaoFactory.js");
const toBN = web3.utils.toBN;
const sha3 = web3.utils.sha3;

contract('LAOLAND - Non Voting Onboarding Adapter', async accounts => {

  it("should be possible to join a DAO as a member without any voting power by requesting Loot while staking raw ETH", async () => {
    const myAccount = accounts[1];
    const advisorAccount = accounts[2];

    let dao = await createDao(myAccount);

    const nonVotingOnboardingAddr = await dao.getAdapterAddress(
      sha3("nonvoting-onboarding")
    );
    const nonVotingOnboarding = await NonVotingOnboardingContract.at(
      nonVotingOnboardingAddr
    );

    const votingAddress = await dao.getAdapterAddress(sha3("voting"));
    const voting = await VotingContract.at(votingAddress);

    // Total of ETH to be sent to the DAO in order to get the Loot shares
    let ethAmount = sharePrice.mul(toBN(3)).add(remaining);

    // Request to join the DAO as an Advisor (non-voting power), Send a tx with RAW ETH only and specify the nonVotingOnboarding
    await nonVotingOnboarding.onboard(dao.address, 0, {
      from: advisorAccount,
      value: ethAmount,
      gasPrice: toBN("0"),
    });

    //Get the new proposal id
    pastEvents = await dao.getPastEvents();
    let { proposalId } = pastEvents[0].returnValues;

    // Sponsor the new proposal to allow the Advisor to join the DAO
    await nonVotingOnboarding.sponsorProposal(dao.address, proposalId, [], {
      from: myAccount,
      gasPrice: toBN("0"),
    });

    // Vote on the new proposal to accept the new Advisor
    await voting.submitVote(dao.address, proposalId, 1, {
      from: myAccount,
      gasPrice: toBN("0"),
    })

    // Process the new proposal
    await advanceTime(10000);
    await nonVotingOnboarding.processProposal(dao.address, proposalId, {
      from: myAccount,
      gasPrice: toBN("0"),
    });

    // Check the number of Loot (non-voting shares) issued to the new Avisor
    const advisorAccountLoot = await dao.nbLoot(advisorAccount);
    assert.equal(advisorAccountLoot.toString(), "3000000000000000");

    // Guild balance must not change when Loot shares are issued
    const guildBalance = await dao.balanceOf(
      GUILD,
      "0x0000000000000000000000000000000000000000"
    );
    assert.equal(guildBalance.toString(), "360000000000000000");
  })

  it("should be possible to join a DAO as a member without any voting power by requesting Loot while staking ERC20 token", async () => {
    const myAccount = accounts[1];
    const advisorAccount = accounts[2];

    // Issue OpenLaw ERC20 Basic Token for tests
    let tokenSupply = 1000000;
    let oltContract = await OLTokenContract.new(tokenSupply);

    let lootSharePrice = 10;
    let nbOfLootShares = 100000000;
    
    let dao = await createDao(myAccount, lootSharePrice, nbOfLootShares, 10, 1, oltContract.address);

    const nonVotingOnboardingAddr = await dao.getAdapterAddress(
      sha3("nonvoting-onboarding")
    );
    const nonVotingMemberContract = await NonVotingOnboardingContract.at(
      nonVotingOnboardingAddr
    );

    // Transfer 1000 OLTs to the Advisor account
    await oltContract.approve(advisorAccount, 100);
    await oltContract.transfer(advisorAccount, 100);
    let advisorTokenBalance = await oltContract.balanceOf.call(
      advisorAccount
    );
    assert.equal(
      "100",
      advisorTokenBalance.toString(),
      "Advisor account must be initialized with 100 OLT Tokens"
    );

    const votingAddress = await dao.getAdapterAddress(sha3("voting"));
    const voting = await VotingContract.at(votingAddress);

    // Total of OLT to be sent to the DAO in order to get the Loot shares
    let tokenAmount = 10;

    // Pre-approve spender (DAO) to transfer applicant tokens
    await oltContract.approve(dao.address, tokenAmount, {
      from: advisorAccount,
      gasPrice: toBN(0),
    });

    // Send a request to join the DAO as an Advisor (non-voting power), 
    // the tx passes the OLT ERC20 token, the amount and the nonVotingOnboarding adapter that handles the proposal
    try {
      await nonVotingMemberContract.onboard(
        dao.address,
        tokenAmount,
        {
          from: advisorAccount,
          gasPrice: toBN("0"),
        }
      );
      assert.equal(true, false, "should have failed!");
    } catch (err) {
      assert.equal(err.message, "Returned error: VM Exception while processing transaction: revert ERC20 transfer not allowed -- Reason given: ERC20 transfer not allowed.");
    }

    await oltContract.approve(nonVotingMemberContract.address, 100, {from: advisorAccount});

    await nonVotingMemberContract.onboard(
      dao.address,
      tokenAmount,
      {
        from: advisorAccount,
        gasPrice: toBN("0"),
      }
    );

    // Sponsor the new proposal to allow the Advisor to join the DAO
    await nonVotingMemberContract.sponsorProposal(dao.address, 0, [], {
      from: myAccount,
      gasPrice: toBN("0"),
    });

    // Vote on the new proposal to accept the new Advisor
    await voting.submitVote(dao.address, 0, 1, {
      from: myAccount,
      gasPrice: toBN("0"),
    });

    // Process the new proposal
    await advanceTime(10000);
    await nonVotingMemberContract.processProposal(dao.address, 0, {
      from: myAccount,
      gasPrice: toBN("0"),
    });

    // Check the number of Loot (non-voting shares) issued to the new Avisor
    const advisorAccountLoot = await dao.nbLoot(advisorAccount);
    assert.equal(advisorAccountLoot.toString(), "100000000");

    // Guild balance must not change when Loot shares are issued
    const guildBalance = await dao.balanceOf(
      GUILD,
      "0x0000000000000000000000000000000000000000"
    );
    assert.equal(guildBalance.toString(), "10");
  });
});