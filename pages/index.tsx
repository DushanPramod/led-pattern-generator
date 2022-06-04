import type {NextPage} from 'next'
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import * as React from 'react';
import ButtonGrid from '../components/button-grid'

const Home: NextPage = () => {
    return (
        <div className={styles.container}>
            <Head>
                <title>LED Pattern Generator</title>
                <meta name="led pattern generator" content="LED Pattern Generator"/>
                <link rel="icon" href="/led.png"/>
            </Head>
            <ButtonGrid/>
        </div>
    )
}

export default Home
