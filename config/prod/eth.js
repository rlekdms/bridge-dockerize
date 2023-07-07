module.exports = {
    // operating chain list
    chain_list: [
        'eth',
        'klaytn',
        'icon',
        'orbit',
        'avax',
        'bsc',
        'celo',
        'heco',
        'fantom',
        'harmony',
        'matic',
        'moonriver',
        'oec',
        'xdai',
        'stacks',
        'ton',
    ],

    // Bridge Addresses
    bridge_address: {
        orbit_hub: "0xb5680a55d627c52de992e3ea52a86f19da475399",
        eth_bridge: "0x78d80c33f23a3395c52b3a8c0d0b12253771b9f7",
        klaytn_bridge: "0x1af95905bb0042803f90e36d79d13aea6cd58969",
        icon_bridge: "0x6819374cb320d1184a681e2b53ad858d16b9c8fa",
        orbit_bridge: "0x77a49649964a186Fd2b8754758c39c9438a6E9aB",
        stacks_bridge: "0x77d50F8e3A95DC0FE71057E54E4Ee9C86147d861",
        ton_bridge: "0x25605C6247fDBC95D91275025ed3dc2632936c3a",
        multisig: {
            hub: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            eth: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            avax: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            bsc: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            celo: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            fantom: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            harmony: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            heco: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            icon: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            klaytn: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            matic: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            moonriver: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            oec: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            ton: "0xFb504CD4eD46024B83c4337044995CF112205f18",
            xdai: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
            orbit: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
        },
        eth: {
            vault: "0x1bf68a9d1eaee7826b3593c20a0ca93293cb489a",
        },
        avax: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        bsc: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        celo: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        fantom: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        harmony: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        heco: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        icon: {
            minter: "cx0eb215b6303142e37c0c9123abd1377feb423f0e",
            multisig: "cxa032c913d5d9b7577e2b19f39d91985e5c260577",
        },
        klaytn: {
            minter: "0x60070F5D2e1C1001400A04F152E7ABD43410F7B9",
            multisig: "0x74bB62c446c592a5A8424d4f9437242df1e26BF0",
        },
        matic: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        moonriver: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        oec: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        stacks: {
            deploy_address: "SP1WTXRKGN0888150AGHCFN1VJXDEPCBJHYC56JE8",
            multisig: "gov-eth",
            "0x0000000000000000000000000000000000000000": "orbit-eth",
            "0xdac17f958d2ee523a2206206994597c13d831ec7": "orbit-usdt",
            "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "orbit-usdc",
            "0xc355fe6e4e99c0b93577f08c4e9a599714435912": "orbit-dai",
            "0x662b67d00a13faf93254714dd601f5ed49ef2f51": "orbit-orc",
        },
        ton: {
            minter: "EQAihs8RdUgLANjNypV5LgaUHfdoUsMVL5o06K2F-qFSki00",
            multisig: "EQBbAqI1eVJ8PbZpKXA5njk6hq8Q6ZUxwXLZf-ntG1wf90Tm",
        },
        wemix: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xCeBB82777bfe09c65AA47E8dD09a2f3972467901",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        xdai: {
            minter: "0x6BD8E3beEC87176BA9c705c9507Aa5e6F0E6706f",
            multisig: "0xFA9c34485c3a706725130E8e0217431AC000E31e",
            admin: "0xe62Fa6C59AD14B46d4e7791FA817030732953b79",
        },
        orbit: {
            minter: "0x1b57Ce997Ca6a009ce54bB2d37DEbEBadFDbBb06",
            multisig: "0xfffec9385a40a12f8526fefc0036b6fc44b68092",
        },
        governance: {
            chain: "ETH",
            address: "0x1bf68a9d1eaee7826b3593c20a0ca93293cb489a",
            bytes: "0x1bf68a9d1eaee7826b3593c20a0ca93293cb489a",
            id: "0x50f408f4b0fb17bf4f5143de4bd95802410d00422f008e9deef06fb101a0f060",
        },
    }
}